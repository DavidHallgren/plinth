declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.html" {
  const content: unknown;
  export default content;
}

declare module "*.png" {
  const url: string;
  export default url;
}
