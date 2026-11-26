// Improv Wi-Fi via de seriële poort (https://www.improv-wifi.com/serial/).
// Daarmee vraagt de installatiepagina in de browser na het flashen meteen naar de wifi.
#include <string.h>
#include "app.h"
#include "esp_log.h"
#include "esp_system.h"
#include "driver/uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define PORT UART_NUM_0
enum { T_STATE = 1, T_ERROR = 2, T_RPC = 3, T_RESULT = 4 };
enum { CMD_WIFI = 1, CMD_STATE = 2, CMD_INFO = 3, CMD_SCAN = 4 };
enum { ST_READY = 2, ST_PROVISIONING = 3, ST_PROVISIONED = 4 };
enum { E_NONE = 0, E_INVALID = 1, E_UNKNOWN_CMD = 2, E_CONNECT = 3 };

static int state = ST_READY;
static char result_url[160];

static void send(uint8_t type, const uint8_t *data, uint8_t len)
{
    uint8_t p[300];
    memcpy(p, "IMPROV", 6);
    p[6] = 1;          // versie
    p[7] = type;
    p[8] = len;
    memcpy(p + 9, data, len);
    uint8_t sum = 0;
    for (int i = 0; i < 9 + len; i++) sum += p[i];
    p[9 + len] = sum;
    p[10 + len] = '\n';
    uart_write_bytes(PORT, p, 11 + len);
}

static void send_state(void) { uint8_t s = state; send(T_STATE, &s, 1); }
static void send_error(uint8_t e) { send(T_ERROR, &e, 1); }

static void send_strings(uint8_t cmd, const char **strs, int n)
{
    uint8_t d[250];
    int k = 2;
    for (int i = 0; i < n; i++) {
        int l = strlen(strs[i]);
        if (k + 1 + l > (int)sizeof(d)) break;
        d[k++] = l;
        memcpy(d + k, strs[i], l);
        k += l;
    }
    d[0] = cmd;
    d[1] = k - 2;
    send(T_RESULT, d, k);
}

void improv_set_state(int s, const char *url)
{
    state = s;
    if (url) strlcpy(result_url, url, sizeof(result_url));
}

static void handle(const uint8_t *d, int len)
{
    uint8_t cmd = d[0];
    if (cmd == CMD_STATE) {
        send_state();
        if (state == ST_PROVISIONED) { const char *u[] = { result_url }; send_strings(CMD_STATE, u, result_url[0] ? 1 : 0); }
    } else if (cmd == CMD_INFO) {
        const char *info[] = { "Overhead-scherm", CONFIG_OVERHEAD_VERSION, "ESP32-P4", "Overhead" };
        send_strings(CMD_INFO, info, 4);
    } else if (cmd == CMD_SCAN) {
        static char names[12][33];
        int n = net_scan(names, 12);
        for (int i = 0; i < n; i++) {
            const char *row[] = { names[i], "-50", "YES" };
            send_strings(CMD_SCAN, row, 3);
        }
        send_strings(CMD_SCAN, NULL, 0);
    } else if (cmd == CMD_WIFI) {
        // data: ssid_len ssid pass_len pass
        int dl = d[1];
        if (dl + 2 > len || dl < 1) { send_error(E_INVALID); return; }
        int sl = d[2];
        if (3 + sl >= 2 + dl + 1) { send_error(E_INVALID); return; }
        int pl = d[3 + sl];
        settings_t s;
        settings_load(&s);
        memset(s.ssid, 0, sizeof(s.ssid));
        memset(s.pass, 0, sizeof(s.pass));
        memcpy(s.ssid, d + 3, sl < 32 ? sl : 32);
        memcpy(s.pass, d + 4 + sl, pl < 64 ? pl : 64);
        state = ST_PROVISIONING;
        send_state();
        net_connect(s.ssid, s.pass);
        if (net_wait_connected(20000)) {
            settings_save(&s);
            state = ST_PROVISIONED;
            send_state();
            const char *u[] = { result_url };
            send_strings(CMD_WIFI, u, result_url[0] ? 1 : 0);
            vTaskDelay(pdMS_TO_TICKS(500));
            esp_restart(); // schoon herstarten met de nieuwe wifi (sluit ook het portaal)
        } else {
            state = ST_READY;
            send_error(E_CONNECT);
            send_state();
        }
    } else {
        send_error(E_UNKNOWN_CMD);
    }
}

// Tekstopdracht van de installatiepagina: "OVERHEAD-URL https://..." bewaart het adres van het beeld
static void line_cmd(char *line)
{
    const char *k = "OVERHEAD-URL ";
    if (strncmp(line, k, strlen(k))) return;
    const char *u = line + strlen(k);
    if (strncmp(u, "https://", 8) && strncmp(u, "http://", 7)) { uart_write_bytes(PORT, "OVERHEAD-ERR\n", 13); return; }
    settings_t s;
    settings_load(&s);
    strlcpy(s.url, u, sizeof(s.url));
    settings_save(&s);
    uart_write_bytes(PORT, "OVERHEAD-OK\n", 12);
    vTaskDelay(pdMS_TO_TICKS(300));
    esp_restart();
}

static void task(void *arg)
{
    uint8_t buf[300];
    int n = 0;
    static char line[300];
    int ln = 0;
    for (;;) {
        uint8_t c;
        if (uart_read_bytes(PORT, &c, 1, portMAX_DELAY) != 1) continue;
        if (c == '\n' || c == '\r') {
            line[ln] = 0;
            if (ln) line_cmd(line);
            ln = 0;
        } else if (c >= 32 && c < 127 && ln < (int)sizeof(line) - 1) {
            line[ln++] = c;
        } else {
            ln = 0; // binair (Improv): geen tekstopdracht
        }
        if (n < 6 && c != (uint8_t)"IMPROV"[n]) { n = (c == 'I'); if (n) buf[0] = c; continue; }
        buf[n++] = c;
        if (n >= 9) {
            int len = buf[8];
            if (n == 10 + len) {
                uint8_t sum = 0;
                for (int i = 0; i < 9 + len; i++) sum += buf[i];
                if (sum == buf[9 + len] && buf[7] == T_RPC && len >= 2) handle(buf + 9, len);
                else if (sum != buf[9 + len]) send_error(E_INVALID);
                n = 0;
            } else if (n >= (int)sizeof(buf)) n = 0;
        }
    }
}

void improv_start(void)
{
    // De console schrijft al naar UART0; wij installeren de driver om ook te kunnen lezen
    if (!uart_is_driver_installed(PORT)) uart_driver_install(PORT, 1024, 0, 0, NULL, 0);
    xTaskCreate(task, "improv", 6144, NULL, 5, NULL);
}
