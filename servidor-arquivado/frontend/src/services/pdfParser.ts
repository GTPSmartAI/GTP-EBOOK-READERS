import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';

// A extração de texto dos livros acontece no backend (text_pipeline). Aqui ficam só as prévias de capa do upload.

// Worker empacotado junto com a versão instalada do pdfjs-dist (versões diferentes são rejeitadas pelo pdf.js)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

/**
 * Renderiza a primeira página do PDF em canvas e retorna imagem em DataURL (Base64)
 */
export async function extractPdfCoverThumbnail(file: File): Promise<string | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    if (pdfDoc.numPages < 1) return null;

    const page = await pdfDoc.getPage(1);
    const initialViewport = page.getViewport({ scale: 1.0 });

    // Escala para gerar uma imagem nítida com ~360px de largura
    const targetWidth = 360;
    const scale = Math.min(2.0, Math.max(0.4, targetWidth / (initialViewport.width || 360)));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const renderContext = {
      canvasContext: ctx,
      canvas,
      viewport: viewport,
    };

    await (page.render(renderContext as any).promise);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch (err) {
    console.warn('Não foi possível gerar thumbnail de capa do PDF no cliente:', err);
    return null;
  }
}

/**
 * Extrai a imagem de capa do arquivo EPUB no cliente via JSZip
 */
export async function extractEpubCoverThumbnail(file: File): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(file);
    const parser = new DOMParser();

    // 1. Procura arquivo .opf via container.xml
    let opfPath: string | null = null;
    const containerXml = zip.file('META-INF/container.xml');
    if (containerXml) {
      const xmlText = await containerXml.async('text');
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
      const rootfile = xmlDoc.querySelector('rootfile');
      if (rootfile) {
        opfPath = rootfile.getAttribute('full-path');
      }
    }

    if (opfPath) {
      const opfFile = zip.file(opfPath);
      if (opfFile) {
        const opfText = await opfFile.async('text');
        const opfDoc = parser.parseFromString(opfText, 'application/xml');
        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

        // Tenta achar elemento de capa no manifest
        const coverItem = opfDoc.querySelector('item[properties~="cover-image"]') ||
                          opfDoc.querySelector('item[id*="cover"]') ||
                          opfDoc.querySelector('item[id*="capa"]');
        let coverHref = coverItem?.getAttribute('href');

        if (!coverHref) {
          const metaCover = opfDoc.querySelector('meta[name="cover"]');
          const coverId = metaCover?.getAttribute('content');
          if (coverId) {
            const item = opfDoc.querySelector(`item[id="${coverId}"]`);
            coverHref = item?.getAttribute('href') || null;
          }
        }

        if (coverHref) {
          const target = opfDir ? `${opfDir}${coverHref}` : coverHref;
          const entry = zip.file(target) || zip.file(coverHref);
          if (entry) {
            const base64 = await entry.async('base64');
            const ext = target.split('.').pop()?.toLowerCase();
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            return `data:${mime};base64,${base64}`;
          }
        }
      }
    }

    // 2. Fallback: varre entradas do zip procurando arquivos com cover ou capa
    let foundEntry: any = null;
    let foundPath = '';
    zip.forEach((path, entry) => {
      const lower = path.toLowerCase();
      if (!foundEntry && (lower.includes('cover') || lower.includes('capa')) &&
          (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp'))) {
        foundEntry = entry;
        foundPath = path;
      }
    });

    if (foundEntry) {
      const base64 = await foundEntry.async('base64');
      const ext = foundPath.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${base64}`;
    }
  } catch (err) {
    console.warn('Não foi possível extrair capa do EPUB no cliente:', err);
  }
  return null;
}

/**
 * Extrai thumbnail de qualquer arquivo suportado (PDF, EPUB, etc.)
 */
export async function extractCoverThumbnail(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    return await extractPdfCoverThumbnail(file);
  }
  if (name.endsWith('.epub')) {
    return await extractEpubCoverThumbnail(file);
  }
  return null;
}
