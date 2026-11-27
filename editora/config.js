export async function endpoint(path = "config.json", key = "appsScriptUrl") {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("Configuração indisponível");
  const config = await response.json();
  if (!config[key]) return null;

  const url = new URL(config[key]);
  if (url.origin !== "https://script.google.com" || !/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname) || url.search || url.hash) {
    throw new Error("Endereço inválido");
  }
  return url;
}
