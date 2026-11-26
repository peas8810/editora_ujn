export function normalizedIsbn(value) {
  const code = String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
  const digit13 = (body) => String((10 - [...body].reduce(
    (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0
  ) % 10) % 10);

  if (/^97[89]\d{10}$/.test(code) && digit13(code.slice(0, 12)) === code[12]) {
    return code;
  }

  if (/^\d{9}[\dX]$/.test(code)) {
    const check = [...code].reduce((sum, digit, index) =>
      sum + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0);
    if (check % 11 === 0) {
      const body = "978" + code.slice(0, 9);
      return body + digit13(body);
    }
  }

  return "";
}
