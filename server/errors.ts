const definitions = {
  INVALID_IMAGE: [400, '请选择有效且非空的食物图片'],
  IMAGE_TOO_LARGE: [413, '图片过大，请压缩至 1 MB 以内'],
  UNSUPPORTED_IMAGE: [415, '仅支持 JPEG、PNG、WebP 图片'],
  AI_TIMEOUT: [504, '食物识别超时，请重试'],
  AI_AUTH_ERROR: [502, 'AI 服务配置异常'],
  AI_RATE_LIMIT: [503, 'AI 服务当前繁忙，请稍后再试'],
  AI_BAD_RESPONSE: [502, '本次识别结果异常，请重新拍摄或重试'],
  AI_UNAVAILABLE: [503, 'AI 服务暂时不可用，请稍后再试'],
  INTERNAL_ERROR: [500, '识别服务发生错误，请稍后重试']
} as const;
export type ErrorCode = keyof typeof definitions;
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode) {
    super(definitions[code][1]); this.code = code; this.status = definitions[code][0];
  }
}
