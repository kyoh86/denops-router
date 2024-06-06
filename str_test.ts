import { commandName } from "./str.ts";
import { assertEquals } from "jsr:@std/assert@^0.225.3";

Deno.test("commandName", () => {
  assertEquals(commandName("foo", "bar/baz"), "FooBarBaz");
  assertEquals(commandName("foo", "bar/baz/qux"), "FooBarBazQux");
  assertEquals(commandName("foo", "bar///baz"), "FooBarBaz");
  assertEquals(commandName("foo", "bar/b/az"), "FooBarBAz");
});
