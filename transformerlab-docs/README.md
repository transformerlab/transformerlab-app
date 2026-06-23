# Website

This website is built using [Docusaurus 2](https://docusaurus.io/), a modern static website generator.

### Installation

```
$ yarn
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

## Papers (`/papers`)

All papers shown at **/papers** (and each paper's own page at `/papers/<slug>`)
are defined in **`src/data/papers.json`**. That's the only file you edit, plus
the PDF.

### Add a new paper

1. **Add the PDF.** Put the paper's PDF in `static/papers/`, e.g.
   `static/papers/my-new-paper.pdf`.

2. **Add an entry to `src/data/papers.json`.** Copy an existing entry and fill
   in the fields. Entries are objects in a JSON array — keep the commas between
   them and don't leave a trailing comma after the last one. Example:

   ```json
   {
     "slug": "my-new-paper",
     "title": "My New Paper: A Catchy Subtitle",
     "authors": ["Asaria", "Salomone", "Gandhi"],
     "date": "2026-07-01",
     "tags": ["LLM", "SYSTEMS"],
     "abstract": "One paragraph summarizing the paper.",
     "pdf": "my-new-paper.pdf"
   }
   ```

3. **Done.** The list card and the `/papers/<slug>` page are generated
   automatically — no code changes needed.

### Fields

| Field      | Required | Notes                                                                        |
| ---------- | -------- | ---------------------------------------------------------------------------- |
| `slug`     | yes      | URL part: `/papers/<slug>`. Lowercase, hyphenated, unique, stable.           |
| `title`    | yes      | Full paper title.                                                            |
| `authors`  | yes      | Array of names, e.g. `["Asaria", "Salomone", "Gandhi"]`.                     |
| `date`     | yes      | `"YYYY-MM-DD"` or `"YYYY-MM"`. Newest dates sort to the top.                 |
| `abstract` | yes      | Shown in full on the paper page, truncated on the list.                      |
| `pdf`      | yes      | Filename in `static/papers/`. Use `""` if the PDF isn't ready yet —          |
|            |          | the page shows a "PDF coming soon" note until you fill it in.                |
| `tags`     | no       | Array of short modality labels, e.g. `["3D", "LLM"]`. Each shown as a badge. |

### Tips

- It's plain JSON, so **no comments** and **use straight double quotes** around
  every key and string value.
- Special characters (em dashes `—`, curly quotes, accents) are fine — just save
  the file as UTF-8 (the default).
- To preview locally: `yarn start`, then open <http://localhost:3000/papers>.
