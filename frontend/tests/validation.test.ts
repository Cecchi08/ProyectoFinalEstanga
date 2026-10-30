import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldError, inferRules, rules } from "../src/utils/validation";

const check = (value: string, ruleSet: ((value: string) => string | null)[]) => fieldError(value, { rules: ruleSet });

test("ciudad: mismos casos que el backend (letras Unicode y espacios, recortada)", () => {
  for (const valid of ["Mar del Plata", "Ñandú del Sur", "São Sebastião", "  Güemes  ", "Villa  Gesell"]) assert.equal(check(valid, rules.city), null, valid);
  for (const invalid of ["Ciudad 9", "Mar_del", "Tandil!", "Mar\tChiquita", "-", "Mar d'Ajó"]) assert.ok(check(invalid, rules.city), JSON.stringify(invalid));
  assert.ok(fieldError("   ", { required: true, rules: rules.city }), "vacía o solo espacios es obligatoria");
});

test("nombres de personas: letras, espacios, apóstrofo, punto y guion", () => {
  for (const valid of ["O'Connor", "José-María", "Ñ. Pérez", "Zoë"]) assert.equal(check(valid, rules.personName), null, valid);
  for (const invalid of ["Ana2", "123", "<script>", "Ana_Paula"]) assert.ok(check(invalid, rules.personName), invalid);
});

test("formatos por tipo: email, teléfono, URL, precio, entero, fecha, hora, ISO, CUIT y código postal", () => {
  const cases: [keyof typeof rules, string[], string[]][] = [
    ["email", ["ana@venti.example"], ["ana@", "ana venti@x.com", "sin-arroba"]],
    ["phone", ["+54 (223) 555-0101", "2235550101"], ["llamar al rato", "12"]],
    ["url", ["https://sala.example/a", "http://x.example"], ["ftp://x.example", "javascript:alert(1)", "sala.example"]],
    ["price", ["0", "1500", "1500.5", "1500.50"], ["-1", "1,5", "1.001", "abc"]],
    ["integer", ["0", "40", "100"], ["1.5", "-3", "diez"]],
    ["date", ["2027-03-15", "2028-02-29"], ["2027-02-30", "15/03/2027", "2027-3-5"]],
    ["time", ["00:00", "23:59"], ["24:00", "9:5", "12:60"]],
    ["isoDateTime", ["2027-03-15T21:00:00-03:00", "2027-03-15T21:00Z"], ["2027-03-15 21:00", "2027-03-15T21:00:00"]],
    ["cuit", ["30-71234567-9", "30712345679"], ["30-7123-9", "abc"]],
    ["postalCode", ["7600", "B7600ABC"], ["76*00", "1"]],
  ];
  for (const [name, valid, invalid] of cases) {
    const ruleSet = rules[name] as ((value: string) => string | null)[];
    for (const value of valid) assert.equal(check(value, ruleSet), null, `${name} acepta ${value}`);
    for (const value of invalid) assert.ok(check(value, ruleSet), `${name} rechaza ${value}`);
  }
});

test("descripciones y textos libres aceptan puntuación legítima y solo limitan la longitud", () => {
  const description = inferRules("Descripción (opcional)");
  assert.equal(check("¡Sala renovada! Precio: $1.500 (IVA inc.) — consultá; 100% accesible.", description), null);
  assert.ok(check("x".repeat(16001), description));
  assert.equal(check("AC/DC & Blink-182", inferRules("Artista (texto del cartel)")), null);
  // Notes allow 16000 characters in the API (marketplace and services): the form must not cut them at 255.
  for (const label of ["Notas (opcional)", "Notas para el cliente"]) assert.equal(check(`Llegada 18:00; prueba de sonido. ${"x".repeat(900)}`, inferRules(label)), null, label);
});

test("la regla se infiere de la etiqueta del campo y los opcionales vacíos no se validan", () => {
  assert.equal(inferRules("Teléfono (opcional)"), rules.phone);
  assert.equal(inferRules("Fecha (AAAA-MM-DD)"), rules.date);
  assert.equal(inferRules("Inicio del evento (HH:MM)"), rules.time);
  assert.equal(inferRules("Precio por hora"), rules.price);
  assert.equal(inferRules("Cupo total"), rules.integer);
  assert.equal(inferRules("Nombre"), rules.personName);
  assert.equal(fieldError("", { rules: rules.phone }), null);
  assert.ok(fieldError("", { required: true, rules: rules.phone }));
});
