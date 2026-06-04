import Modal from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  variant = 'default',
}: ConfirmDialogProps) {
  const confirmButtonClass = variant === 'danger' ? 'btn-danger' : 'btn-primary';

  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <button className="btn-secondary" onClick={() => onOpenChange(false)}>
            {cancelText}
          </button>
          <button className={confirmButtonClass} onClick={handleConfirm}>
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{description}</p>
    </Modal>
  );
}
