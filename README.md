# vite-plugin-render-svg

A [Vite](https://vitejs.dev) plugin to render SVG files to PNG. This is useful for generating map symbols for [Maplibre GL JS](https://maplibre.org/maplibre-gl-js). Supports the `@2x` suffix for generating Retina/high-DPI images.

In development mode, PNG files are rendered on the fly by the dev server. When building for production, the rendered PNG files are optimised with oxipng.

## Installation

```bash
    $ npm install -D @russss/vite-plugin-render-svg
```

## Usage

```js
    import { renderSVG } from "@russss/vite-plugin-render-svg"
    
    export default defineConfig({
        plugins: [
            renderSVG({
                pattern: "src/icons/*.svg",
                urlPrefix: "/icons/"
            })
        ]
    })
```

A file at `src/icons/example.svg` will now be accessible at `/icons/example.png` (and `/icons/example.png@2x` at twice the scale).

## Options

| Option         | Type                                 | Description                                                                                   |
| -------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `pattern`      | `string`                             | A glob pattern that specifies which SVG files to process.                                     |
| `urlPrefix`    | `string`                             | The prefix which the resulting PNG files will be rendered at.                                 |
| `scales`       | `int[]` (optional)                   | A list of scale factors which the PNG files will be rendered at (default: `[1, 2]`)           |