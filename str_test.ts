import { commandName } from "./str.ts";
import { assertEquals } from "https://deno.land/std@0.210.0/assert/mod.ts";

Deno.test("commandName", () => {
  assertEquals(commandName("foo", "bar/baz"), "FooBarBaz");
  assertEquals(commandName("foo", "bar/baz/qux"), "FooBarBazQux");
  assertEquals(commandName("foo", "bar///baz"), "FooBarBaz");
  assertEquals(commandName("foo", "bar/b/az"), "FooBarBAz");
});
