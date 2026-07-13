import { beforeAll } from "vitest";
import i18n from "./index";

beforeAll(async () => {
  await i18n.changeLanguage("zh-CN");
});
