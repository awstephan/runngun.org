import { useQuery } from '@tanstack/react-query';

import { TEMPLATES_DTAG } from '@/lib/config';
import { useTrustedAdmin } from '@/hooks/useTrustedAdmin';

export interface EventTemplate {
  id: string;
  name: string;
  title: string;
  summary: string;
  content: string;
  location: string;
  image: string;
  price: string;
  links: string[];
}

export function useTemplateList() {
  const trustedAdmin = useTrustedAdmin();
  const authority = trustedAdmin.authority;

  const query = useQuery({
    queryKey: ['template-list', authority?.revision],
    queryFn: async ({ signal }) => {
      const events = await trustedAdmin.queryTrusted(
        [
          {
            kinds: [30078],
            '#d': [TEMPLATES_DTAG],
            limit: 1,
          },
        ],
        { signal }
      );

      if (events.length === 0) {
        return [];
      }

      const content = events[0].content;
      try {
        const templates: EventTemplate[] = JSON.parse(content);
        if (Array.isArray(templates)) {
          return templates.filter((t): t is EventTemplate => 
            typeof t.id === 'string' && typeof t.name === 'string'
          );
        }
      } catch {
        // Invalid content
      }
      return [];
    },
    enabled: Boolean(authority),
    staleTime: 30_000,
  });

  return query;
}
