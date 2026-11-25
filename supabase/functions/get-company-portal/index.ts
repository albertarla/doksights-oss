import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  record.count++;
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

// Validate company slug format
function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') return false;
  if (slug.length < 1 || slug.length > 100) return false;
  // Only allow lowercase letters, numbers, and hyphens
  return /^[a-z0-9-]+$/.test(slug);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    if (isRateLimited(clientIP)) {
      console.log(`Rate limited IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { companySlug } = body;
    console.log(`Processing portal request for slug: ${companySlug}`);

    // Validate slug
    if (!isValidSlug(companySlug)) {
      console.log(`Invalid slug format: ${companySlug}`);
      return new Response(
        JSON.stringify({ error: 'Invalid company slug format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch company by slug
    console.log(`Fetching company data for slug: ${companySlug}`);
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, slug, portal_description, portal_enabled, portal_privacy, logo_url, portal_primary_color, portal_background_color')
      .eq('slug', companySlug)
      .single();

    if (companyError || !company) {
      console.log(`Company not found for slug: ${companySlug}`, companyError);
      return new Response(
        JSON.stringify({ error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if portal is enabled
    if (!company.portal_enabled) {
      console.log(`Portal not enabled for company: ${companySlug}`);
      return new Response(
        JSON.stringify({ error: 'This company portal is not available' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Private portal access check
    if (company.portal_privacy === 'private') {
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (!token) {
        return new Response(
          JSON.stringify({ error: 'PRIVATE_PORTAL', slug: companySlug }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify JWT via Supabase (this validates against Supabase JWKS)
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ error: 'PRIVATE_PORTAL', slug: companySlug }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const userId = authUser.id;

      // Superadmins can access any private portal
      const { data: profileCheck } = await supabase
        .from('profiles')
        .select('is_superadmin')
        .eq('id', userId)
        .maybeSingle();

      const isSuperadmin = profileCheck?.is_superadmin === true;

      if (!isSuperadmin) {
        // Check if user is a portal user for this specific company
        const { data: portalAccess } = await supabase
          .from('portal_users')
          .select('id')
          .eq('company_id', company.id)
          .eq('user_id', userId)
          .maybeSingle();

        // Check if user is an active company member for this specific company
        const { data: memberAccess } = await supabase
          .from('company_users')
          .select('id')
          .eq('company_id', company.id)
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle();

        if (!portalAccess && !memberAccess) {
          return new Response(
            JSON.stringify({ error: 'PORTAL_ACCESS_DENIED' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Fetch folders for this company
    console.log(`Fetching folders for company: ${company.id}`);
    const { data: folders, error: foldersError } = await supabase
      .from('folders')
      .select('id, name, description, display_order')
      .eq('company_id', company.id)
      .order('display_order', { ascending: true });

    if (foldersError) {
      console.error('Error fetching folders:', foldersError);
    }

    // Fetch public manuals for this company
    console.log(`Fetching public manuals for company: ${company.id}`);
    const { data: manuals, error: manualsError } = await supabase
      .from('manuals')
      .select('id, title, description, file_path, manual_type, page_count, folder_id, display_order, created_at')
      .eq('company_id', company.id)
      .eq('is_public', true)
      .order('display_order', { ascending: true });

    if (manualsError) {
      console.error('Error fetching manuals:', manualsError);
      return new Response(
        JSON.stringify({ error: 'Error fetching manuals' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate signed URLs for each manual
    console.log(`Processing ${manuals?.length || 0} manuals...`);
    const manualsWithUrls = await Promise.all(
      (manuals || []).map(async (manual) => {
        try {
          let pdfUrl = null;

          if (manual.manual_type !== 'web' && manual.file_path) {
            console.log(`Generating signed URL for manual: ${manual.id} (${manual.file_path})`);
            const { data: signedUrlData, error: signedUrlError } = await supabase
              .storage
              .from('manuals')
              .createSignedUrl(manual.file_path, 3600);

            if (signedUrlError) {
              console.error(`Error generating signed URL for manual ${manual.id}:`, signedUrlError);
              return null;
            }
            pdfUrl = signedUrlData?.signedUrl;
          }

          return {
            id: manual.id,
            title: manual.title,
            description: manual.description,
            manualType: manual.manual_type || 'pdf',
            pageCount: manual.page_count,
            folderId: manual.folder_id,
            displayOrder: manual.display_order,
            createdAt: manual.created_at,
            pdfUrl,
          };
        } catch (err) {
          console.error(`Error processing manual ${manual.id}:`, err);
          return null;
        }
      })
    );

    // Filter out any manuals that failed to get signed URLs
    const validManuals = manualsWithUrls.filter(Boolean);

    // Organize manuals by folder
    const folderMap = new Map<string | null, any[]>();

    // Initialize with null folder for uncategorized
    folderMap.set(null, []);

    // Initialize all folders
    (folders || []).forEach(folder => {
      folderMap.set(folder.id, []);
    });

    // Distribute manuals to folders
    validManuals.forEach(manual => {
      if (manual) {
        const folderId = manual.folderId;
        const folderManuals = folderMap.get(folderId) || folderMap.get(null) || [];
        folderManuals.push(manual);
        folderMap.set(folderId || null, folderManuals);
      }
    });

    // Build response structure
    const organizedFolders = (folders || []).map(folder => ({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      displayOrder: folder.display_order,
      manuals: folderMap.get(folder.id) || [],
    }));

    // Add uncategorized manuals
    const uncategorizedManuals = folderMap.get(null) || [];

    console.log(`Portal fetched successfully: ${validManuals.length} manuals, ${(folders || []).length} folders`);

    return new Response(
      JSON.stringify({
        company: {
          name: company.name,
          description: company.portal_description,
          logoUrl: company.logo_url,
          primaryColor: company.portal_primary_color,
          backgroundColor: company.portal_background_color,
        },
        folders: organizedFolders,
        uncategorizedManuals,
        totalManuals: validManuals.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in Edge Function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
