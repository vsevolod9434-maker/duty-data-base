export const isStaticExportEnabled = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

export const backendOnlyOperationMessage =
  "Приказ требует защищённого допуска штаба. В текущем режиме действие закрыто.";

export const transactionalImportMessage =
  "Массовая сверка записей требует подтверждения дежурного штаба. В текущем режиме действие закрыто.";
