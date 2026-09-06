#include <errno.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#include <util.h>

// Give scrcpy a terminal for immediate line-buffered readiness logs. No pixels.
static volatile sig_atomic_t stopping;
static void forward_signal(int sig) {
    (void)sig;
    stopping = 1;
}
int main(int argc, char **argv) {
    if (argc < 2 || argv[1][0] != '/') return 64;
    int master, slave;
    if (openpty(&master, &slave, NULL, NULL, NULL) != 0) return 71;
    signal(SIGTERM, forward_signal);
    signal(SIGINT, forward_signal);
    signal(SIGPIPE, SIG_IGN);
    pid_t owner = getppid();
    pid_t pid = fork();
    if (pid < 0) return 71;
    if (pid == 0) {
        signal(SIGTERM, SIG_DFL);
        signal(SIGINT, SIG_DFL);
        close(master);
        if (dup2(slave, STDOUT_FILENO) < 0) _exit(71);
        close(slave);
        execv(argv[1], &argv[1]);
        _exit(127);
    }
    close(slave);
    printf("OPENGUI_CHILD_PID=%d\n", pid);
    fflush(stdout);
    int status = 0;
    struct timespec stop_time = {0};
    for (;;) {
        if (getppid() != owner && !stopping) forward_signal(SIGTERM);
        if (stopping) {
            struct timespec now;
            clock_gettime(CLOCK_MONOTONIC, &now);
            if (!stop_time.tv_sec) { stop_time = now; kill(pid, SIGTERM); }
            if (now.tv_sec - stop_time.tv_sec >= 2) kill(pid, SIGKILL);
        }
        struct pollfd fd = { .fd = master, .events = POLLIN };
        if (poll(&fd, 1, 100) > 0 && (fd.revents & POLLIN)) {
            char buffer[4096];
            ssize_t count = read(master, buffer, sizeof(buffer));
            if (count > 0) { fwrite(buffer, 1, (size_t)count, stdout); fflush(stdout); }
        }
        pid_t result = waitpid(pid, &status, WNOHANG);
        if (result == pid || (result < 0 && errno != EINTR)) break;
    }
    close(master);
    return WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
}
