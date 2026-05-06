import { Modal } from './Modal';
import { StlViewer } from './StlViewer';
import { BASE_URL, type Allegato } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
  idLavoro: number;
  allegato: Allegato | null;
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

export function FilePreviewModal({ open, onClose, idLavoro, allegato }: Props) {
  if (!allegato) {
    return <Modal open={open} onClose={onClose} title="" size="lg">{null}</Modal>;
  }
  const url = `${BASE_URL}/api/lavori/${idLavoro}/allegati/${allegato.id}`;
  const ext = extOf(allegato.nome_file);
  const isStl = ext === 'stl';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
  const isPdf = ext === 'pdf';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={allegato.nome_file}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Chiudi</button>
          <a className="btn-link" href={url} target="_blank" rel="noreferrer">⬇ Scarica</a>
        </>
      }
    >
      {isStl && <StlViewer url={url} />}
      {isImage && (
        <div className="preview-image-wrap">
          <img src={url} alt={allegato.nome_file} className="preview-image" />
        </div>
      )}
      {isPdf && (
        <iframe src={url} title={allegato.nome_file} className="preview-pdf" />
      )}
      {!isStl && !isImage && !isPdf && (
        <p className="muted">
          Nessuna anteprima disponibile per i file <code>.{ext || '?'}</code>.
          Usa "Scarica" per aprirlo.
        </p>
      )}
    </Modal>
  );
}
