// Bun's HTML bundler turns an image import into its served URL. (assets.d.ts can't
// declare this: a .d.ts beside a same-named .ts is ignored by tsc.)
declare module "*.webp" {
  const url: string;
  export default url;
}
