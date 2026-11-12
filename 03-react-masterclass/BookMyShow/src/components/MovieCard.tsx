import React from "react";
import { Link } from "react-router-dom";

interface MovieCardProps {
  movie: { id: string; title: string; genre: string };
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onRemoveFavorite?: (id: string) => void;
  isFavoritePage?: boolean;
}

export const MovieCard = React.memo(({ movie, isFavorite, onToggleFavorite }: MovieCardProps) => {
  return (
    <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-600 transition-all shadow-lg">
      <div>
        <span className="text-[10px] uppercase tracking-widest text-rose-400 font-bold px-2.5 py-1 bg-rose-500/10 rounded-md border border-rose-500/25">
          {movie.genre}
        </span>
        <h3 className="text-lg font-bold mt-3 text-slate-100">{movie.title}</h3>
      </div>
      <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-700/50">
        <Link 
          to={`/movie/${movie.id}`} 
          className="text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 px-3.5 py-2 rounded-xl transition-colors"
        >
          View Details
        </Link>
        <button 
          onClick={() => onToggleFavorite(movie.id)}
          className={`text-xs px-3.5 py-2 rounded-xl font-semibold transition-colors ${
            isFavorite 
              ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-900/30' 
              : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
          }`}
        >
          {isFavorite ? "❤️ Favorited" : "🤍 Favorite"}
        </button>
      </div>
    </div>
  );
});

MovieCard.displayName = "MovieCard";