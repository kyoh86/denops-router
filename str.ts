function pascalCase(str: string) {
  return str.replaceAll(/(?<=^|\W+)\w/g, (s) => s.toUpperCase()).replaceAll(
    /\W/g,
    "",
  );
}

export function pascalWords(...words: string[]) {
  return words.map(pascalCase).join("");
}
