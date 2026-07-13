/**
 * Feishu/Lark HTTP client — bypass local HTTP_PROXY for open.feishu.cn APIs.
 *
 * Node axios honors HTTP_PROXY; misconfigured proxies (common with dev VPN)
 * cause ERR_FR_TOO_MANY_REDIRECTS and infinite WS reconnect spam.
 */

import axios from 'axios'
import type { AxiosInstance } from 'axios'

/** Shared axios instance: direct connection, no proxy */
export function createFeishuHttpInstance(): AxiosInstance {
  return axios.create({
    proxy: false,
    // Do not inherit HTTP(S)_PROXY from the environment
    maxRedirects: 5,
    timeout: 30_000,
  })
}
