function titleCase(str: string) {
  return str.replaceAll(/(?<=^|\W+)\w/g, (s) => s.toUpperCase()).replaceAll(
    /\W/g,
    "",
  );
}

export function commandName(...words: string[]) {
  return words.map(titleCase).join("");
}
