import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  markdown: string;
  apiUrl: string;
}

export default function PublicShareNotes({ markdown, apiUrl }: Props) {
  const base = apiUrl.replace(/\/$/, '');
  const transformUri = (src: string) => {
    if (src.startsWith('/public/share/')) return `${base}${src}`;
    return src;
  };

  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      transformImageUri={transformUri}
      transformLinkUri={transformUri}
    >
      {markdown}
    </Markdown>
  );
}
