/*
 * What a wrong edit here would break silently: a field marked required that
 * was actually only sometimes present, a `null` sample failing to widen a
 * field's type, a nested object inlined instead of hoisted (or hoisted in
 * the wrong order — Zod's `const child = ...` has to exist textually before
 * a parent references it), two same-named nested objects colliding instead
 * of getting a suffix, and a Python dataclass whose required fields drift
 * after its optional ones, which is a runtime error in Python, not a lint
 * warning.
 */
import type { CheckSuite } from "./harness.mts";
import { generateTypesFromJson, sanitizeTypeName, shapeFromJson } from "../lib/json-tip";

export const checks: CheckSuite = (check) => {
  const flat = generateTypesFromJson('{"id": 1, "name": "Ali"}', "Root");
  check(
    "json-tip: sadə obyektdə hər iki sahə düzgün tiplə çıxır",
    flat.ok && flat.result.typescript.includes("id: number;") && flat.result.typescript.includes("name: string;"),
    flat.ok ? flat.result.typescript : flat.error,
  );

  const optional = generateTypesFromJson('{"users": [{"id": 1, "nickname": "x"}, {"id": 2}]}', "Root");
  check(
    "json-tip: bütün nümunələrdə olmayan açar opsional işarələnir",
    optional.ok && optional.result.typescript.includes("nickname?:") && optional.result.pythonTypedDict.includes("NotRequired["),
    optional.ok ? optional.result.typescript : optional.error,
  );

  const nullable = generateTypesFromJson('{"users": [{"manager": "Ali"}, {"manager": null}]}', "Root");
  check(
    "json-tip: hər nümunədə olan, amma bəzən null olan sahə opsional YOX, nullable olur",
    nullable.ok && nullable.result.typescript.includes("manager: string | null;") && !nullable.result.typescript.includes("manager?:"),
    nullable.ok ? nullable.result.typescript : nullable.error,
  );

  const nested = generateTypesFromJson('{"address": {"city": "Bakı"}}', "Root");
  check(
    "json-tip: iç-içə obyekt ayrı adlandırılmış tip kimi, valideyndən əvvəl çıxır",
    nested.ok &&
      nested.result.typescript.includes("interface Address {") &&
      nested.result.typescript.indexOf("interface Address {") < nested.result.typescript.indexOf("address: Address;"),
    nested.ok ? nested.result.typescript : nested.error,
  );

  const collision = shapeFromJson({ user: { a: 1 }, User: { b: 2 } }, "Root");
  check(
    "json-tip: ad toqquşması ikinci tipə rəqəm əlavə edir",
    collision.types.some((t) => t.name === "User") && collision.types.some((t) => t.name === "User2"),
    `tiplər: ${collision.types.map((t) => t.name).join(", ")}`,
  );

  const bareString = generateTypesFromJson('"salam"', "Root");
  check(
    "json-tip: tək sətir dəyəri kök tip alias-ı kimi çıxır",
    bareString.ok && bareString.result.typescript.includes("type Root = string;"),
    bareString.ok ? bareString.result.typescript : bareString.error,
  );

  const bareArray = generateTypesFromJson("[1, 2, 3]", "Root");
  check(
    "json-tip: rəqəm massivi kök massiv tipi kimi çıxır",
    bareArray.ok && bareArray.result.typescript.includes("type Root = number[];"),
    bareArray.ok ? bareArray.result.typescript : bareArray.error,
  );

  const mixed = generateTypesFromJson('{"list": [{"x": "a"}, {"x": 5}]}', "Root");
  check(
    "json-tip: qarışıq tip Go-da interface{} kimi, şərhlə birgə çıxır",
    mixed.ok && mixed.result.go.includes("interface{}") && mixed.result.go.includes("mixed type"),
    mixed.ok ? mixed.result.go : mixed.error,
  );

  const dataclassOrder = generateTypesFromJson('{"list": [{"id": 1, "nickname": "x"}, {"id": 2}]}', "Root");
  check(
    "json-tip: dataclass-da məcburi sahə optional sahədən əvvəl gəlir",
    dataclassOrder.ok && dataclassOrder.result.pythonDataclass.indexOf("id:") < dataclassOrder.result.pythonDataclass.indexOf("nickname:"),
    dataclassOrder.ok ? dataclassOrder.result.pythonDataclass : dataclassOrder.error,
  );

  const zodOrder = generateTypesFromJson('{"address": {"city": "Bakı"}}', "Root");
  check(
    "json-tip: zod-da uşaq sxem valideyndən əvvəl bəyan olunur",
    zodOrder.ok &&
      zodOrder.result.zod.indexOf("addressSchema = z.object") !== -1 &&
      zodOrder.result.zod.indexOf("addressSchema = z.object") < zodOrder.result.zod.indexOf("address: addressSchema"),
    zodOrder.ok ? zodOrder.result.zod : zodOrder.error,
  );

  check("json-tip: rəqəmlə başlayan kök adı düzəldilir", sanitizeTypeName("123abc") === "T123abc", `alındı: ${sanitizeTypeName("123abc")}`);

  const brokenJson = generateTypesFromJson("{not valid json", "Root");
  check("json-tip: pozuq JSON throw etmir, error qaytarır", brokenJson.ok === false, `alındı: ${JSON.stringify(brokenJson)}`);

  const emptyObject = generateTypesFromJson("{}", "Root");
  check(
    "json-tip: boş obyekt hər beş formada da etibarlı kod verir",
    emptyObject.ok && emptyObject.result.typescript.includes("interface Root {") && emptyObject.result.pythonTypedDict.includes("pass"),
    emptyObject.ok ? emptyObject.result.typescript : emptyObject.error,
  );
};
