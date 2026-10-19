// خطأ من مزود خارجي: retryable يحدد إعادة المحاولة، وuserMessage رسالة عربية تظهر للمستخدم
export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean, public userMessage: string) {
    super(message);
  }
}
