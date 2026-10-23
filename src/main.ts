import "./ui/style.css";
import { WillowmereApp } from "./ui/app";
import { t, esc } from "./ui/i18n";
const root = document.querySelector<HTMLElement>("#app")!;
root.innerHTML = `<div class="loading-screen"><div class="little-tree"></div><p>${t("app.loading")}</p><div class="loading-bar"></div></div>`;
new WillowmereApp(root).boot().catch((error: unknown) => {
  console.error(error);
  root.innerHTML = `<section class="error-screen"><h1>${t("app.error")}</h1><p>${esc(error instanceof Error ? error.message : String(error))}</p><button onclick="location.reload()">${t("app.retry")}</button></section>`;
});
