import { createContext, useContext, useReducer, useEffect, useState, useMemo, useCallback } from "react";
import { BrowserRouter, Routes, Route, Link, Outlet, useParams } from "react-router-dom";
import { MovieCard } from "./components/MovieCard";

interface Movie { id: string; title: string; genre: string; }
interface MovieState { movies: Movie[]; favorites: string[]; loading: boolean; searchQuery: string; }
type MovieAction = | { type: "SET_MOVIES", payload: Movie[] } | { type: "SET_LOADING", payload: boolean } | { type: "ADD_FAVORITE", payload: string } | { type: "REMOVE_FAVORITE", payload: string } | { type: "SET_SEARCH_QUERY", payload: string };
interface MovieContextType { state: MovieState; dispatch: React.Dispatch<MovieAction>; }

const MovieContext = createContext<MovieContextType | undefined>(undefined);

const MovieReducer = (state: MovieState, action: MovieAction): MovieState => {
  switch(action.type) {
    case "SET_MOVIES":
      return { ...state, movies: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "ADD_FAVORITE":
      if (state.favorites.includes(action.payload)) return state;
      return { ...state, favorites: [...state.favorites, action.payload] };
    case "REMOVE_FAVORITE":
      return { ...state, favorites: state.favorites.filter(id => id !== action.payload) };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };
    default:
      return state;
  }
};

const Layout = () => {
  const context = useContext(MovieContext);
  const favoritesCount = context?.state.favorites.length || 0;
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex justify-between items-center shadow-md">
        <Link to="/" className="text-xl font-extrabold tracking-tight text-rose-500 flex items-center gap-2">
          🎟️ BookMyShow <span className="text-xs px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded-full font-medium border border-rose-500/20">SPA</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link to="/" className="hover:text-rose-400 transition-colors">Home</Link>
          <Link to="/favorites" className="flex items-center gap-1.5 hover:text-rose-400 transition-colors">
            <span>❤️ Favorites</span>
            <span className="bg-rose-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">{favoritesCount}</span>
          </Link>
        </nav>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500 bg-slate-950/30">
        BookMyShow Clone • Built with React, TypeScript & Tailwind CSS
      </footer>
    </div>
  );
}

const Home = () => {
  const context = useContext(MovieContext);
  const movies = context?.state.movies || [];
  const favorites = context?.state.favorites || [];
  const searchQuery = context?.state.searchQuery || "";
  const isLoading = context?.state.loading || false;
  const dispatch = context?.dispatch;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    context?.dispatch({ type: "SET_SEARCH_QUERY", payload: e.target.value });
  }

  const handleToggleFavorite = useCallback((id: string) => {
    const isFav = favorites.includes(id);
    dispatch?.({ type: isFav ? "REMOVE_FAVORITE" : "ADD_FAVORITE", payload: id });
  }, [favorites, dispatch]);

  const filteredMovies = useMemo(() => {
    return movies.filter(movie =>
      movie.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      movie.genre.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [movies, searchQuery]);

  if(isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 animate-pulse">
        <p className="text-lg font-medium">⏳ Loading movies from server...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">Featured Movies</h1>
          <p className="text-sm text-slate-400 mt-1">Explore and book your favorite cinematic experiences.</p>
        </div>
        <div className="w-full md:w-80">
          <input 
            type="text" 
            placeholder="🔍 Search movies..." 
            value={searchQuery} 
            onChange={handleSearchChange} 
            className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all"
          />
        </div>
      </div>

      {filteredMovies.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-12 text-center">
          <p className="text-slate-400">No movies found matching: "{searchQuery}"</p>
        </div>
      ) : (        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMovies.map(movie => (
            <MovieCard 
              key={movie.id} 
              movie={movie} 
              isFavorite={favorites.includes(movie.id)} 
              onToggleFavorite={handleToggleFavorite} 
            />
          ))}       
        </div>
      )}
    </div>
  );
}

const Favorites = () => {
  const context = useContext(MovieContext);
  const favoriteIDs = context?.state.favorites || [];
  const allmovies = context?.state.movies || [];
  const dispatch = context?.dispatch;

  // const favoriteMovies = allmovies.filter(movie => favoriteIDs.includes(movie.id));

  const favoriteMovies = useMemo(() => {
    return allmovies.filter(movie => favoriteIDs.includes(movie.id));
  }, [allmovies, favoriteIDs]);

  const handleRemoveFavorite = useCallback((id: string) => {
    dispatch?.({ type: "REMOVE_FAVORITE", payload: id });
  }, [dispatch]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">Your Favorite Movies</h1>
        <p className="text-sm text-slate-400 mt-1">Quick access to your personal watchlist.</p>
      </div>

      {favoriteMovies.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-12 text-center">
          <p className="text-slate-400 mb-4">You haven't added any favorite movies yet!</p>
          <Link to="/" className="inline-block px-5 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 transition-colors">
            Browse Movies
          </Link>
        </div>
      ) : (        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {favoriteMovies.map(movie => (
            <MovieCard 
              key={movie.id} 
              movie={movie} 
              isFavorite={true} 
              onToggleFavorite={handleRemoveFavorite} 
            />
          ))}
        </div>
      )}
      
      <div className="mt-8">
        <Link to="/" className="text-sm font-semibold text-rose-400 hover:text-rose-300 transition-colors">
          ⬅️ Back to Home
        </Link>
      </div>
    </div>
  );
}

const MovieDetails = () => {
  const context = useContext(MovieContext);
  const { id } = useParams();

  const movie = context?.state.movies.find(m => m.id === id);
  const isFavorite = id ? context?.state.favorites.includes(id) : false;
  
  const handleToggle = () => {
    if (!id) return;
    if (isFavorite) {
      context?.dispatch({ type: "REMOVE_FAVORITE", payload: id });
    } else {
      context?.dispatch({ type: "ADD_FAVORITE", payload: id });
    }
  };

  if (!movie) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-12 text-center max-w-md mx-auto">
        <p className="text-slate-300 font-medium mb-4">Movie not found!</p>
        <Link to="/" className="px-5 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 transition-colors">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-slate-800/40 border border-slate-700/60 rounded-2xl p-8 shadow-xl">
      <span className="text-xs uppercase tracking-widest text-rose-400 font-bold px-3 py-1 bg-rose-500/10 rounded-md border border-rose-500/20">
        {movie.genre}
      </span>
      <h1 className="text-4xl font-extrabold mt-4 mb-3 text-slate-100 tracking-tight">{movie.title}</h1>
      <p className="text-slate-300 mb-8 leading-relaxed text-base">
        Experience cinematic brilliance with {movie.title}. Book your tickets now or save it to your personal watchlist for quick access anytime.
      </p>

      <div className="flex items-center gap-4 pt-6 border-t border-slate-700/60">
        <button 
          onClick={handleToggle}
          className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg ${
            isFavorite 
              ? 'bg-rose-600 text-white hover:bg-rose-700' 
              : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
          }`}
        >
          {isFavorite ? "Remove from Favorites ❤️" : "Add to Favorites 🤍"}
        </button>
        <Link 
          to="/" 
          className="px-6 py-3 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
};

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val:T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error (error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val:T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);      
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

function App() {
  const [savedFavorites, setSavedFavorites] = useLocalStorage<string[]>("bookmyshow_favorites", []);
  const getInitialState = (): MovieState => ({
    movies: [], favorites: savedFavorites, loading: true, searchQuery: "",
  });
  const [state, dispatch] = useReducer(MovieReducer, null, getInitialState);

  useEffect(() => {
    setSavedFavorites(state.favorites);
  }, [state.favorites, setSavedFavorites]);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const mockData: Movie[] = [
          { id: "1", title: "Leo", genre: "Action" },
          { id: "2", title: "Vikram", genre: "Thriller" },
          { id: "3", title: "Master", genre: "Drama" }
        ];
        dispatch({ type: "SET_MOVIES", payload: mockData });
        dispatch({ type: "SET_LOADING", payload: false });
      } catch (error) {
        console.error(error);
        dispatch({ type: "SET_LOADING", payload: false});
      }
    };
    fetchMovies();
  }, []);

  return (
    <MovieContext.Provider value={{state, dispatch}}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="favorites" element={<Favorites />} />
            <Route path="movie/:id" element={<MovieDetails />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MovieContext.Provider>
  );
}

export default App;