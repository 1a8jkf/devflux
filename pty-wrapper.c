#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <pty.h>
#include <sys/wait.h>
#include <sys/select.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <fcntl.h>

#define RESIZE_FD 3

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <cmd> [args...]\n", argv[0]);
        return 1;
    }

    struct winsize ws;
    memset(&ws, 0, sizeof(ws));
    ws.ws_col = 80;
    ws.ws_row = 24;

    char *env_cols = getenv("PTY_COLS");
    char *env_rows = getenv("PTY_ROWS");
    if (env_cols && atoi(env_cols) > 0) {
        ws.ws_col = atoi(env_cols);
    }
    if (env_rows && atoi(env_rows) > 0) {
        ws.ws_row = atoi(env_rows);
    }

    int master;
    pid_t pid = forkpty(&master, NULL, NULL, &ws);

    if (pid < 0) {
        perror("forkpty");
        return 1;
    }

    if (pid == 0) {
        // Child
        setenv("TERM", "xterm-256color", 1);
        execvp(argv[1], argv + 1);
        perror("execvp");
        return 1;
    }

    // Parent: make RESIZE_FD non-blocking if open
    int flags = fcntl(RESIZE_FD, F_GETFL, 0);
    int resize_fd_valid = (flags != -1);
    if (resize_fd_valid) {
        fcntl(RESIZE_FD, F_SETFL, flags | O_NONBLOCK);
    }

    fd_set fds;
    char buf[4096];
    char resize_buf[256];
    int resize_buf_len = 0;

    while (1) {
        FD_ZERO(&fds);
        FD_SET(STDIN_FILENO, &fds);
        FD_SET(master, &fds);
        int max_fd = master > STDIN_FILENO ? master : STDIN_FILENO;

        if (resize_fd_valid) {
            FD_SET(RESIZE_FD, &fds);
            if (RESIZE_FD > max_fd) {
                max_fd = RESIZE_FD;
            }
        }

        if (select(max_fd + 1, &fds, NULL, NULL, NULL) < 0) {
            break;
        }

        if (FD_ISSET(STDIN_FILENO, &fds)) {
            ssize_t n = read(STDIN_FILENO, buf, sizeof(buf));
            if (n <= 0) break;
            write(master, buf, n);
        }

        if (FD_ISSET(master, &fds)) {
            ssize_t n = read(master, buf, sizeof(buf));
            if (n <= 0) break;
            write(STDOUT_FILENO, buf, n);
        }

        if (resize_fd_valid && FD_ISSET(RESIZE_FD, &fds)) {
            ssize_t n = read(RESIZE_FD, resize_buf + resize_buf_len, sizeof(resize_buf) - 1 - resize_buf_len);
            if (n <= 0) {
                // Pipe closed
                resize_fd_valid = 0;
            } else {
                resize_buf_len += n;
                resize_buf[resize_buf_len] = '\0';
                // Process lines like "<cols> <rows>\n"
                char *newline;
                while ((newline = strchr(resize_buf, '\n')) != NULL) {
                    *newline = '\0';
                    int c = 0, r = 0;
                    if (sscanf(resize_buf, "%d %d", &c, &r) == 2 && c > 0 && r > 0) {
                        ws.ws_col = c;
                        ws.ws_row = r;
                        ioctl(master, TIOCSWINSZ, &ws);
                    }
                    int remaining = resize_buf_len - (newline - resize_buf + 1);
                    if (remaining > 0) {
                        memmove(resize_buf, newline + 1, remaining);
                    }
                    resize_buf_len = remaining;
                    resize_buf[resize_buf_len] = '\0';
                }
                if (resize_buf_len >= sizeof(resize_buf) - 1) {
                    // Overflow protection: clear buffer
                    resize_buf_len = 0;
                }
            }
        }
    }

    waitpid(pid, NULL, 0);
    return 0;
}