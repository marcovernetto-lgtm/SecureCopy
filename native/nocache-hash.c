// securecopy-hash: SHA-256 of a file read from the storage device, not from RAM.
//
// macOS keeps freshly written data in the unified buffer cache. Hashing a file
// right after writing it therefore usually checks memory, not the disk. This
// helper, for each window of the file:
//   1. flushes the file to the physical medium (F_FULLFSYNC, once);
//   2. evicts the window's pages from the cache (msync MS_INVALIDATE);
//   3. confirms with mincore() that no page of the window is still resident;
//   4. reads the window with F_NOCACHE into page-aligned buffers.
//
// Protocol on stdout:
//   P <bytes read so far>                      (progress, repeated)
//   H <sha256 hex> <bytes> <flushed 0|1> <nocache 0|1> <resident pages seen>
// Exit status is non-zero on any read error; the message is on stderr.

#include <CommonCrypto/CommonDigest.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#define WINDOW (64LL * 1024 * 1024)
#define BUFFER (8 * 1024 * 1024)
#define PROGRESS_STEP (16LL * 1024 * 1024)

static int fail(const char *what) {
  fprintf(stderr, "%s: %s\n", what, strerror(errno));
  return 1;
}

// Returns the number of pages of [offset, offset+length) still in the cache
// after invalidation, or -1 if the window could not be checked.
static long long evict_window(int fd, off_t offset, size_t length, size_t page) {
  void *map = mmap(NULL, length, PROT_READ, MAP_SHARED, fd, offset);
  if (map == MAP_FAILED) return -1;
  long long resident = -1;
  if (msync(map, length, MS_SYNC | MS_INVALIDATE) == 0) {
    size_t pages = (length + page - 1) / page;
    char *vector = malloc(pages);
    if (vector && mincore(map, length, vector) == 0) {
      resident = 0;
      for (size_t i = 0; i < pages; i++) if (vector[i] & MINCORE_INCORE) resident++;
    }
    free(vector);
  }
  munmap(map, length);
  return resident;
}

int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "uso: securecopy-hash <file>\n");
    return 64;
  }
  int fd = open(argv[1], O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) return fail("apertura");
  struct stat st;
  if (fstat(fd, &st) != 0) return fail("stat");
  if (!S_ISREG(st.st_mode)) {
    fprintf(stderr, "il percorso non è un file normale\n");
    return 65;
  }

  int flushed = fcntl(fd, F_FULLFSYNC) == 0;
  if (!flushed) fsync(fd);
  int nocache = fcntl(fd, F_NOCACHE, 1) == 0;
  fcntl(fd, F_RDAHEAD, 0);

  size_t page = (size_t)getpagesize();
  void *buffer = NULL;
  if (posix_memalign(&buffer, page, BUFFER) != 0) return fail("memoria");

  CC_SHA256_CTX ctx;
  CC_SHA256_Init(&ctx);
  long long total = 0, next_progress = PROGRESS_STEP, resident_seen = 0;
  int checked = 1;

  for (off_t window = 0; window < st.st_size; window += WINDOW) {
    off_t remaining = st.st_size - window;
    size_t length = (size_t)(remaining < WINDOW ? remaining : WINDOW);
    long long resident = evict_window(fd, window, length, page);
    if (resident < 0) checked = 0; else resident_seen += resident;

    off_t offset = window, end = window + (off_t)length;
    while (offset < end) {
      size_t want = (size_t)((end - offset) < BUFFER ? (end - offset) : BUFFER);
      ssize_t got = pread(fd, buffer, want, offset);
      if (got < 0) {
        if (errno == EINTR) continue;
        return fail("lettura");
      }
      if (got == 0) {
        fprintf(stderr, "il file si è accorciato durante la verifica\n");
        return 66;
      }
      CC_SHA256_Update(&ctx, buffer, (CC_LONG)got);
      offset += got;
      total += got;
      if (total >= next_progress) {
        printf("P %lld\n", total);
        fflush(stdout);
        next_progress = total + PROGRESS_STEP;
      }
    }
  }

  // A file that grew while being read is not the file that was verified.
  char extra;
  if (pread(fd, &extra, 1, st.st_size) > 0) {
    fprintf(stderr, "il file è cresciuto durante la verifica\n");
    return 66;
  }

  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256_Final(digest, &ctx);
  printf("H ");
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) printf("%02x", digest[i]);
  printf(" %lld %d %d %lld\n", total, flushed, nocache && checked, checked ? resident_seen : -1);
  free(buffer);
  close(fd);
  return 0;
}
