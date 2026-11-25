import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function MarkdownImage({ src, alt, ...props }: any) {
  const [imgSrc, setImgSrc] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchUrl = async () => {
      if (!src) {
        setLoading(false);
        return;
      }
      
      // Check if it's a special storage path marker or just a raw path
      let path = src;
      if (src.includes('storage://')) {
        path = src.split('storage://')[1];
      }

      // If it doesn't look like a standard HTTP url, assume it's a storage path
      if (!src.startsWith('http') || src.includes('storage://')) {
        try {
          const { data } = supabase.storage.from('web_images').getPublicUrl(path);
          if (mounted && data?.publicUrl) {
            setImgSrc(data.publicUrl);
          }
        } catch (e) {
          console.error("Failed to load public URL for image", e);
        }
      } else {
        // It's a regular external URL
        setImgSrc(src);
      }
      if (mounted) setLoading(false);
    };

    fetchUrl();
    return () => { mounted = false; };
  }, [src]);

  if (loading) {
    return <span className="inline-block w-full h-48 my-4 animate-pulse bg-muted rounded-md" />;
  }

  if (!imgSrc) {
    return (
      <span className="inline-flex w-full h-48 my-4 bg-muted/50 border border-dashed border-muted-foreground/30 items-center justify-center text-muted-foreground rounded-md text-sm">
        Image failed to load
      </span>
    );
  }

  return (
    <img 
      src={imgSrc} 
      alt={alt} 
      {...props} 
      className="rounded-md border border-border max-h-[600px] object-contain my-4" 
      loading="lazy" 
    />
  );
}
