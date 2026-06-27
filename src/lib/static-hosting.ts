export const isStaticExportEnabled = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

export const backendOnlyOperationMessage =
  "Операция требует защищённого серверного обработчика и недоступна на статическом хостинге GitHub Pages.";

export const transactionalImportMessage =
  "Массовый импорт и автоматическое создание записей требуют транзакционного серверного обработчика.";
