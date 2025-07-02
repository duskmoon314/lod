import tailwindcss from "@tailwindcss/postcss";

export default async function tailwindPlugin(context, options) {
  return {
    name: "docusaurus-tailwind-plugin",

    configurePostCss(postcssOptions) {
      postcssOptions.plugins.push(tailwindcss);

      return postcssOptions;
    },
  };
}
