import { describe, expect, it } from "vitest";
import { pesos, percent, toCsv } from "./csv.js";

describe("toCsv", () => {
  it("separa con punto y coma, termina cada fila con CRLF y empieza con BOM", () => {
    const csv = toCsv([
      ["Período", "Ventas"],
      ["2026-10-01", "1234,50"],
    ]);
    expect(csv).toBe("﻿Período;Ventas\r\n2026-10-01;1234,50\r\n");
  });

  it("entrecomilla lo que tiene separador, comillas o saltos de línea", () => {
    expect(toCsv([["a;b", 'dice "hola"', "dos\nlíneas"]])).toBe('﻿"a;b";"dice ""hola""";"dos\nlíneas"\r\n');
  });

  it("deja vacío lo que no tiene valor y conserva los números", () => {
    expect(toCsv([[null, undefined, 0, 12]])).toBe("﻿;;0;12\r\n");
  });

  it("neutraliza las celdas de texto que Excel interpretaría como fórmula", () => {
    const csv = toCsv([["=HYPERLINK(\"http://x\")", "+cmd", "-2+3", "@SUMA(A1)", "normal"]]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(";'+cmd;");
    expect(csv).toContain(";'-2+3;");
    expect(csv).toContain(";'@SUMA(A1);");
    expect(csv).toContain(";normal");
  });

  it("un número negativo no es una fórmula: no se toca", () => {
    expect(toCsv([[-5]])).toBe("﻿-5\r\n");
  });
});

describe("pesos / percent", () => {
  it("pesos usa coma decimal y dos decimales", () => {
    expect(pesos(123456)).toBe("1234,56");
    expect(pesos(100)).toBe("1,00");
    expect(pesos(5)).toBe("0,05");
    expect(pesos(-2550)).toBe("-25,50");
  });

  it("percent usa coma decimal y queda vacío si no hay valor", () => {
    expect(percent(42.5)).toBe("42,5");
    expect(percent(0)).toBe("0,0");
    expect(percent(null)).toBe("");
  });
});
