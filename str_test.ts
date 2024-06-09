import { pascalWords } from "./str.ts";
import { assertEquals } from "jsr:@std/assert@^0.225.3";

Deno.test("pascalWords", () => {
  assertEquals(pascalWords("foo", "bar/baz"), "FooBarBaz");
  assertEquals(pascalWords("foo", "bar/baz/qux"), "FooBarBazQux");
  assertEquals(pascalWords("foo", "bar///baz"), "FooBarBaz");
  assertEquals(pascalWords("foo", "bar/b/az"), "FooBarBAz");
});
