export async function endpoint(path = "config.json") {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("Configuração indisponível");
  const { appsScriptUrl } = await response.json();
  if (!appsScriptUrl) return null;

  const url = new URL(appsScriptUrl);
  if (url.origin !== "https://script.google.com" || !/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname) || url.search || url.hash) {
    throw new Error("Endereço inválido");
  }
  return url;
}
