// Instelportaal op http://192.168.4.1 (via het toegangspunt "Overhead-scherm").
// Een kleine DNS-server stuurt elke naam naar het scherm, zodat gsm's het portaal vanzelf openen.
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "app.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_http_server.h"
#include "lwip/sockets.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "portal";
static char nets[16][33];
static int nnets;

/* ---------- DNS: elk A-verzoek -> 192.168.4.1 ---------- */
static void dns_task(void *arg)
{
    int s = socket(AF_INET, SOCK_DGRAM, 0);
    struct sockaddr_in a = { .sin_family = AF_INET, .sin_port = htons(53), .sin_addr.s_addr = htonl(INADDR_ANY) };
    bind(s, (struct sockaddr *)&a, sizeof(a));
    uint8_t b[512];
    for (;;) {
        struct sockaddr_in from;
        socklen_t fl = sizeof(from);
        int n = recvfrom(s, b, sizeof(b) - 16, 0, (struct sockaddr *)&from, &fl);
        if (n < 12) continue;
        b[2] |= 0x80;            // antwoord
        b[3] = 0x80;             // recursie beschikbaar, geen fout
        b[7] = 1;                // 1 antwoord
        b[8] = b[9] = b[10] = b[11] = 0;
        const uint8_t ans[] = { 0xC0, 0x0C, 0, 1, 0, 1, 0, 0, 0, 30, 0, 4, 192, 168, 4, 1 };
        memcpy(b + n, ans, sizeof(ans));
        sendto(s, b, n + sizeof(ans), 0, (struct sockaddr *)&from, fl);
    }
}

/* ---------- HTML ---------- */
static void esc(char *out, size_t cap, const char *in)
{
    size_t k = 0;
    for (; *in && k + 7 < cap; in++) {
        const char *r = NULL;
        switch (*in) {
        case '&': r = "&amp;"; break;
        case '<': r = "&lt;"; break;
        case '>': r = "&gt;"; break;
        case '"': r = "&quot;"; break;
        }
        if (r) { strcpy(out + k, r); k += strlen(r); }
        else out[k++] = *in;
    }
    out[k] = 0;
}

static const char *HEAD =
    "<!doctype html><html lang=nl><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>Overhead-scherm</title><style>"
    "body{font:16px system-ui,-apple-system,sans-serif;margin:0;background:#f6f4f0;color:#111316}"
    "main{max-width:440px;margin:0 auto;padding:24px 16px}h1{font-size:24px;margin:8px 0 4px}"
    "p{color:#6a717a;margin:0 0 18px;line-height:1.45}label{display:block;font-weight:600;font-size:14px;margin:16px 0 6px}"
    "input,select{width:100%;box-sizing:border-box;font:16px system-ui;padding:12px;border:1px solid #d8d4cd;border-radius:10px;background:#fff}"
    "button{margin-top:22px;width:100%;font:600 16px system-ui;padding:14px;border:0;border-radius:10px;background:#111316;color:#fff}"
    "details{margin-top:18px;color:#6a717a;font-size:14px}small{color:#6a717a}</style><main>";

static esp_err_t page(httpd_req_t *r)
{
    settings_t s;
    settings_load(&s);
    httpd_resp_set_type(r, "text/html; charset=utf-8");
    httpd_resp_sendstr_chunk(r, HEAD);
    httpd_resp_sendstr_chunk(r,
        "<h1>Overhead-scherm</h1><p>Kies het wifi-netwerk van het huis en vul het wachtwoord in. "
        "Het scherm herstart daarna en toont de vliegtuigen.</p><form method=post action=/save>"
        "<label for=ssid>Wifi-netwerk</label><input id=ssid name=ssid list=nets autocomplete=off required value=\"");
    char e[300];
    esc(e, sizeof(e), s.ssid);
    httpd_resp_sendstr_chunk(r, e);
    httpd_resp_sendstr_chunk(r, "\"><datalist id=nets>");
    for (int i = 0; i < nnets; i++) {
        esc(e, sizeof(e), nets[i]);
        httpd_resp_sendstr_chunk(r, "<option value=\"");
        httpd_resp_sendstr_chunk(r, e);
        httpd_resp_sendstr_chunk(r, "\">");
    }
    httpd_resp_sendstr_chunk(r, "</datalist>");
    if (nnets) {
        httpd_resp_sendstr_chunk(r, "<small>Gevonden: ");
        for (int i = 0; i < nnets && i < 6; i++) {
            esc(e, sizeof(e), nets[i]);
            if (i) httpd_resp_sendstr_chunk(r, ", ");
            httpd_resp_sendstr_chunk(r, e);
        }
        httpd_resp_sendstr_chunk(r, "</small>");
    }
    httpd_resp_sendstr_chunk(r,
        "<label for=pass>Wachtwoord</label><input id=pass name=pass type=password autocomplete=off>"
        "<details><summary>Adres van het beeld</summary><label for=url>Adres</label><input id=url name=url value=\"");
    esc(e, sizeof(e), s.url);
    httpd_resp_sendstr_chunk(r, e);
    httpd_resp_sendstr_chunk(r,
        "\"><small>Komt van de pagina /frame op de site (plaats, straal en titel zitten erin).</small></details>"
        "<button type=submit>Bewaren en herstarten</button></form></main>");
    return httpd_resp_sendstr_chunk(r, NULL);
}

static void urldecode(char *s)
{
    char *o = s;
    for (; *s; s++) {
        if (*s == '+') *o++ = ' ';
        else if (*s == '%' && isxdigit((unsigned char)s[1]) && isxdigit((unsigned char)s[2])) {
            char h[3] = { s[1], s[2], 0 };
            *o++ = (char)strtol(h, NULL, 16);
            s += 2;
        } else *o++ = *s;
    }
    *o = 0;
}

static void field(char *body, const char *key, char *out, size_t cap)
{
    size_t kl = strlen(key);
    for (char *p = body; p && *p;) {
        char *amp = strchr(p, '&');
        if (!strncmp(p, key, kl) && p[kl] == '=') {
            size_t n = amp ? (size_t)(amp - p - kl - 1) : strlen(p + kl + 1);
            char tmp[400];
            if (n >= sizeof(tmp)) n = sizeof(tmp) - 1;
            memcpy(tmp, p + kl + 1, n);
            tmp[n] = 0;
            urldecode(tmp);
            strlcpy(out, tmp, cap);
            return;
        }
        p = amp ? amp + 1 : NULL;
    }
}

static void restart_later(void *arg)
{
    vTaskDelay(pdMS_TO_TICKS(1500));
    esp_restart();
}

static esp_err_t save(httpd_req_t *r)
{
    char body[800] = { 0 };
    int got = 0;
    while (got < r->content_len && got < (int)sizeof(body) - 1) {
        int n = httpd_req_recv(r, body + got, sizeof(body) - 1 - got);
        if (n <= 0) return ESP_FAIL;
        got += n;
    }
    settings_t s;
    settings_load(&s);
    field(body, "ssid", s.ssid, sizeof(s.ssid));
    field(body, "pass", s.pass, sizeof(s.pass));
    char url[256] = "";
    field(body, "url", url, sizeof(url));
    if (!strncmp(url, "https://", 8) || !strncmp(url, "http://", 7)) strlcpy(s.url, url, sizeof(s.url));
    settings_save(&s);
    ESP_LOGI(TAG, "wifi bewaard: %s", s.ssid);
    httpd_resp_set_type(r, "text/html; charset=utf-8");
    httpd_resp_sendstr_chunk(r, HEAD);
    httpd_resp_sendstr_chunk(r, "<h1>Bewaard</h1><p>Het scherm herstart en maakt verbinding. Na een halve minuut verschijnen de vliegtuigen. "
                                "Lukt het niet, dan verschijnt deze uitleg opnieuw op het scherm.</p></main>");
    httpd_resp_sendstr_chunk(r, NULL);
    xTaskCreate(restart_later, "restart", 2048, NULL, 5, NULL);
    return ESP_OK;
}

static esp_err_t to_root(httpd_req_t *r, httpd_err_code_t e)
{
    httpd_resp_set_status(r, "302 Found");
    httpd_resp_set_hdr(r, "Location", "http://192.168.4.1/");
    return httpd_resp_send(r, NULL, 0);
}

void portal_start(void)
{
    static bool on;
    if (on) return;
    on = true;
    nnets = net_scan(nets, 16);
    net_start_ap();
    httpd_handle_t h;
    httpd_config_t c = HTTPD_DEFAULT_CONFIG();
    c.lru_purge_enable = true;
    c.stack_size = 8192;
    if (httpd_start(&h, &c) != ESP_OK) {
        ESP_LOGE(TAG, "webserver start niet");
        return;
    }
    const httpd_uri_t get = { .uri = "/", .method = HTTP_GET, .handler = page };
    const httpd_uri_t post = { .uri = "/save", .method = HTTP_POST, .handler = save };
    httpd_register_uri_handler(h, &get);
    httpd_register_uri_handler(h, &post);
    httpd_register_err_handler(h, HTTPD_404_NOT_FOUND, to_root);
    xTaskCreate(dns_task, "dns", 3072, NULL, 4, NULL);
    ESP_LOGI(TAG, "portaal op http://192.168.4.1");
}
