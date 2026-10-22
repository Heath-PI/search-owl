# Search Owl

Isolated public deployment of Search Owl. This repository intentionally contains only the web page, bounded search service, real CC0 barn-owl image and its license record.

Optional provider credentials are read only from server environment variables. None are committed. Google Translate web handoffs work without credentials; in-page Cloud Translation remains unavailable until a separately approved key and billing account exist.

Automatic no-key coverage is bounded to official/public metadata interfaces: Wikipedia, Library of Congress, Open Library, Crossref, Europe PMC, World Bank Documents & Reports, Project Gutenberg, Internet Archive, and DuckDuckGo Instant Answers. General web engines, national collections without a supported API, and official exchange/regulator sites are query-preserving browser handoffs and are never counted as collected results.

Search responses are fetched on demand and cached for at most two minutes. Provider publication/indexing delays still apply. Search Owl does not claim real-time securities quotes; licensed feeds such as NSE real-time and delayed market products are intentionally not redistributed.

Browser integration is available through `/opensearch.xml`. Browsers without OpenSearch discovery can use `https://search-owl.onrender.com/?q=%s` as a custom site-search URL.

The page adds rule-based context panels for mathematics, space, places, government, economics and local-service searches. Optional location details are used only when the visitor supplies them for a location-relevant query. Short follow-up continuity stays in that browser tab through session storage; Search Owl does not create a server-side user profile.

Decorative city, gaming, fashion and fuel subjects can use a small, attributed Wikimedia Commons collage around the page edges. Each picture links to its source and displays the listed creator, license and source date when available. Current-event searches deliberately keep generic decoration so pictures cannot be mistaken for evidence of an incident. Explicit decorative imagery is suppressed; this does not filter or alter legitimate search results. When a safely attributed picture is unavailable, generated CSS scenes provide a neutral fallback. The centered owl and results below it never move, and the side collage disappears on smaller screens.

Fuel-price searches keep retail station prices distinct from crude-oil or securities data. Optional location details may narrow the provider handoffs, but Search Owl never invents a station price or calls a price live without a supported feed and displayed timestamp.

Financial discovery includes a searchable, region-organized directory of 48 major official securities exchanges and exchange groups across North America, South America, Europe, Africa, the Middle East, and Asia-Pacific, verified October 21, 2026. It explicitly covers ASX in Sydney, B3 in São Paulo, Bolsa de Valores de Caracas, and the Santiago/Lima/Colombia exchanges within the nuam regional holding. The directory is broad rather than falsely described as exhaustive and links to the World Federation of Exchanges membership directory for wider authoritative discovery. Search Owl does not republish exchange quote streams. Displayed handoff notes preserve documented delay or licensing boundaries and distinguish Beijing BSE from Bombay BSE.

Agricultural discovery is deliberately separate from securities markets. Nine official, no-cost source handoffs cover global FAO monitoring plus Thailand, Malaysia, Vietnam, Laos, the United States, and the European Union. Labels distinguish farm-gate, purchase-point, wholesale, retail, bulletin, and dashboard data. A cited Thailand OAE example preserves the exact Hom Mali 105 paddy-rice observations published over the prior 14 days, including item/grade, unit, currency, locality, market type, observation dates, and retrieval date; missing dates are not invented or interpolated. The page does not claim that local markets form one universal market or that every farmers market is covered.
