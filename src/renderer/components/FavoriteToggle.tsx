interface FavoriteToggleProps {
  isFavorite: boolean
  onToggle: () => void
}

export default function FavoriteToggle({ isFavorite, onToggle }: FavoriteToggleProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      style={{
        position: 'absolute',
        top: 2,
        left: 2,
        width: 20,
        height: 20,
        borderRadius: '50%',
        border: 'none',
        background: isFavorite ? '#ffb300' : 'rgba(0,0,0,0.4)',
        color: isFavorite ? '#1a1a1a' : '#888',
        fontSize: 12,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        zIndex: 5,
        padding: 0
      }}
    >
      {isFavorite ? '\u2605' : '\u2606'}
    </button>
  )
}
