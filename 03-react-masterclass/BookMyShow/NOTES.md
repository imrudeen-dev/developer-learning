/*
================================================================================
BOOKMYSHOW PROJECT - STEP 28 & 29: GIT HYGIENE, WORKFLOW RECOVERY & TERMINAL MECHANICS
================================================================================

1. REPOSITORY HYGIENE & GIT CACHE REMOVAL
   - Discovered and corrected filename typo `_gitignore` -> `.gitignore`.
   - Executed `git rm -r --cached node_modules` to untrack the dependencies 
     folder from Git index while preserving local disk files (Recipe vs. Cake).

2. ADVANCED TERMINAL NAVIGATION & STREAM EDITING
   - Used `fc -l START END` for native Bash line-range history listing.
   - Piped output into `sed -n 'START,ENDp'` (Stream Editor) for targeted range prints.
   - Mastered `!N:p` to pull line `N` onto prompt without auto-execution.
   - Piped `git status | less` into scrollable viewports (`q` to exit).

3. GLOBAL CLI PRODUCTIVITY ENGINE (`fzf` FUZZY FINDER)
   - Distinguished shell utilities (global OS level in `~/.fzf`) from project 
     dependencies (`node_modules`), adding zero bloat to project bundles.
   - Configured `Ctrl + R` keybindings globally across Ubuntu WSL2 environment.

4. GIT IDENTITY & CONVENTIONAL COMMITS
   - Configured author identity via `git config user.name` & `git config user.email`.
   - Atomic staging and conventional commit execution via conditional `&&`.
================================================================================
*/

// Import necessary React hooks and functions from the "react" library
import React, { createContext, useContext, useReducer, useEffect } from "react";

// Import routing components from "react-router-dom" for multi-page navigation
import { BrowserRouter, Routes, Route, Link, Outlet, useParams } from "react-router-dom";

// ---------------------------------------------------------
// 1. TYPES & BLUEPRINTS (Compile-Time TypeScript Definitions)
// ---------------------------------------------------------

// Define the shape/contract of a single Movie object
interface Movie {
  id: string;    // Unique identifier for the movie (e.g., "1")
  title: string; // The name of the movie
  genre: string; // The category/genre of the movie
}

// Define the shape of our global application state (Master Ledger)
interface MovieState {
  movies: Movie[];     // Global array holding all available movies
  favorites: string[]; // Global array storing the IDs of favorited movies
  loading: boolean;    // Global boolean flag tracking server fetch status
}

// Define strict rules for all possible actions that can alter the state
type MovieAction = 
  | { type: "SET_MOVIES"; payload: Movie[] }     // Action to populate global movies
  | { type: "SET_LOADING"; payload: boolean }   // Action to update loading status
  | { type: "ADD_FAVORITE"; payload: string }   // Action to add an ID to favorites
  | { type: "REMOVE_FAVORITE"; payload: string }; // Action to remove an ID from favorites

// Define the shape of the data shared across our global Context provider
interface MovieContextType {
  state: MovieState;                       // The current global state data
  dispatch: React.Dispatch<MovieAction>;   // The function used to send action packages
}

// Create the global Context broadcast channel, starting as undefined
const MovieContext = createContext<MovieContextType | undefined>(undefined);

// ---------------------------------------------------------
// 2. THE REDUCER FUNCTION (The Global Brain & Auditor)
// ---------------------------------------------------------

// Receives current state and an action, processes rules, and returns a new state
const MovieReducer = (state: MovieState, action: MovieAction): MovieState => {
  // Inspect the action type label to determine which rule to execute
  switch (action.type) {
    case "SET_MOVIES":
      // Return a new state object, updating the movies array with payload data
      return { ...state, movies: action.payload };

    case "SET_LOADING":
      // Return a new state object, updating the loading flag with payload data
      return { ...state, loading: action.payload };

    case "ADD_FAVORITE":
      // If the ID already exists in favorites, return state unchanged to prevent duplicates
      if (state.favorites.includes(action.payload)) return state;
      // Return a new state object, spreading old properties and appending new ID
      return { ...state, favorites: [...state.favorites, action.payload] };

    case "REMOVE_FAVORITE":
      // Return a new state object, using .filter() to drop the ID matching action payload
      return { ...state, favorites: state.favorites.filter(id => id !== action.payload) };

    default:
      // Fallback: if action type is unrecognized, return current state untouched
      return state;
  }
};

// ---------------------------------------------------------
// 3. UI COMPONENTS
// ---------------------------------------------------------

// Layout component wraps around all pages to provide a persistent navigation bar
const Layout = () => {
  // Consume the global context to read state data safely
  const context = useContext(MovieContext);
  
  // Calculate total favorites count safely using optional chaining
  const favoritesCount = context?.state.favorites.length || 0;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      {/* Top Navigation Bar */}
      <nav style={{ display: "flex", justifyContent: "space-between", background: "#1f2937", color: "#fff", padding: "15px 20px", borderRadius: "8px" }}>
        <h2 style={{ margin: 0 }}>🎟️ BookMyShow</h2>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          {/* Link back to Home page */}
          <Link to="/" style={{ color: "#fff", textDecoration: "none" }}>Home</Link>
          {/* Link to Favorites page with interactive badge count */}
          <Link to="/favorites" style={{ color: "#fff", textDecoration: "none" }}>
            ❤️ Favorites <span style={{ background: "#e11d48", padding: "2px 8px", borderRadius: "10px", fontSize: "0.8rem" }}>{favoritesCount}</span>
          </Link>
        </div>
      </nav>
      {/* Outlet renders the active child route component */}
      <div style={{ marginTop: "20px" }}>
        <Outlet />
      </div>
    </div>
  );
};

// Home component renders featured movies read directly from global state
const Home = () => {
  // Access global context data
  const context = useContext(MovieContext);
  
  // Read movies and loading status from global state container
  const movies = context?.state.movies || [];
  const loading = context?.state.loading || false;

  // Conditional rendering while global data is loading
  if (loading) {
    return <div style={{ padding: "20px", textAlign: "center" }}><p>⏳ Loading movies from server...</p></div>;
  }

  return (
    <div style={{ padding: "20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff" }}>
      <h3>🏠 Featured Movies</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {/* Map through global movies and render dynamic route links */}
        {movies.map(movie => (
          <li key={movie.id} style={{ margin: "12px 0", padding: "10px", background: "#f9fafb", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span><strong>{movie.title}</strong> ({movie.genre})</span>
            <Link to={`/movie/${movie.id}`} style={{ padding: "6px 12px", background: "#2563eb", color: "#fff", textDecoration: "none", borderRadius: "4px", fontSize: "0.9rem" }}>View Details</Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Favorites component renders only the movies saved in the global favorites list
const Favorites = () => {
  // Access global context data
  const context = useContext(MovieContext);
  
  // Retrieve global favorite IDs and global movies array
  const favoriteIds = context?.state.favorites || [];
  const allMovies = context?.state.movies || [];

  // Filter global movies array to include only movies whose IDs are stored in favorites
  const favoriteMovies = allMovies.filter(movie => favoriteIds.includes(movie.id));

  return (
    <div style={{ padding: "20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff" }}>
      <h3>❤️ Your Favorite Movies</h3>
      {favoriteMovies.length === 0 ? (
        <p style={{ color: "#6b7280" }}>You haven't added any favorite movies yet!</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {favoriteMovies.map(movie => (
            <li key={movie.id} style={{ margin: "12px 0", padding: "10px", background: "#f9fafb", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><strong>{movie.title}</strong> ({movie.genre})</span>
              <Link to={`/movie/${movie.id}`} style={{ padding: "6px 12px", background: "#2563eb", color: "#fff", textDecoration: "none", borderRadius: "4px", fontSize: "0.9rem" }}>View Details</Link>
            </li>
          ))}
        </ul>
      )}
      <br />
      <Link to="/" style={{ color: "#2563eb", textDecoration: "none" }}>⬅️ Back to Home</Link>
    </div>
  );
};

// MovieDetails component finds and renders specific movie info using global state lookup
const MovieDetails = () => {
  // Extract the dynamic :id parameter from the URL path
  const { id } = useParams();
  
  // Access global context data
  const context = useContext(MovieContext);
  
  // Look up the specific movie object from global state using array .find()
  const movie = context?.state.movies.find(m => m.id === id);
  
  // Check if current movie ID exists in global favorites array
  const isFavorite = id ? context?.state.favorites.includes(id) : false;

  // Handler function to toggle add/remove status via global dispatch
  const handleToggle = () => {
    if (!id) return;
    if (isFavorite) {
      context?.dispatch({ type: "REMOVE_FAVORITE", payload: id });
    } else {
      context?.dispatch({ type: "ADD_FAVORITE", payload: id });
    }
  };

  // Fallback if URL ID does not match any known movie
  if (!movie) {
    return <div><p>Movie not found!</p><Link to="/">Back to Home</Link></div>;
  }

  return (
    <div style={{ padding: "20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff" }}>
      <h3>🎬 {movie.title}</h3>
      <p><strong>Genre:</strong> {movie.genre}</p>
      <p>Status: <strong>{isFavorite ? "In Favorites ❤️" : "Not in Favorites 🤍"}</strong></p>
      {/* Toggle button styling changes dynamically based on favorite status */}
      <button 
        onClick={handleToggle}
        style={{ padding: "10px 16px", background: isFavorite ? "#dc2626" : "#2563eb", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
      >
        {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
      </button>
      <br /><br />
      <Link to="/" style={{ color: "#2563eb", textDecoration: "none" }}>⬅️ Back to Home</Link>
    </div>
  );
};

// ---------------------------------------------------------
// 4. APP ROOT, PROVIDER & INITIAL GLOBAL FETCH SETUP
// ---------------------------------------------------------
function App() {
  // Initialize global useReducer state engine with movies, favorites, and loading flag
  const [state, dispatch] = useReducer(MovieReducer, {
    movies: [],
    favorites: [],
    loading: true
  });

  // useEffect executes mock API fetch globally when App boots up on mount
  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const mockData: Movie[] = [
          { id: "1", title: "Leo", genre: "Action / Thriller" },
          { id: "2", title: "Master", genre: "Action / Drama" },
          { id: "3", title: "Vikram", genre: "Action / Crime" },
          { id: "4", title: "Interstellar", genre: "Sci-Fi / Adventure" }
        ];

        // Dispatch fetched movies into global state
        dispatch({ type: "SET_MOVIES", payload: mockData });
        // Dispatch loading false into global state
        dispatch({ type: "SET_LOADING", payload: false });
      } catch (error) {
        console.error("Failed to fetch movies", error);
        dispatch({ type: "SET_LOADING", payload: false });
      }
    };

    fetchMovies();
  }, []); // Empty dependency array ensures this runs once on mount

  return (
    /* Wrap app in Context Provider to broadcast global state and dispatch functions */
    <MovieContext.Provider value={{ state, dispatch }}>
      <BrowserRouter>
        <Routes>
          {/* Setup layout route wrapping all child pages */}
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

/*
================================================================================
APPENDIX: STEP 29 COMMAND LOG & TERMINAL REFERENCE MANUAL
================================================================================

1. GIT IDENTITY & REPOSITORY CONFIGURATION
   - git config user.name "imrudeen-dev"
     Configures local author name for commit signatures in this project.
   - git config user.email "ninjauideveloper@gmail.com"
     Configures local author email for Git commit attribution.
   - git add .
     Stages all modified, deleted, and newly created files in working directory.
   - git commit -m "feat: complete core react engine with routing, context reducer, and search filtering (steps 1-29)"
     Commits staged files with structured conventional commit narrative.

2. REPOSITORY HYGIENE & DISK MANAGEMENT
   - ls -la
     Lists all directory entries in long format, revealing hidden dotfiles (.gitignore).
   - mv _gitignore .gitignore
     Renames file to standard dotfile so Git core engine identifies ignore rules.
   - git rm -r --cached node_modules
     Recursively un-tracks node_modules from Git index while retaining local folder.
   - git status | less
     Pipes git status into scrollable viewport pager (press `q` to exit).

3. COMMAND HISTORY NAVIGATION & LINE FILTERING
   - !N:p
     Prints history line number N directly onto prompt for review without execution.
   - fc -l 77 88
     Lists history entries bounded strictly between line 77 and line 88.
   - history | sed -n '77,88p'
     Streams history output into sed stream editor, printing only lines 77 through 88.

4. GLOBAL SHELL TOOLING (`fzf` INTEGRATION)
   - git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
     Clones shallow repository of Fuzzy Finder directly into Linux home directory (~).
   - ~/.fzf/install
     Executes interactive installer for keybindings and shell integration.
   - source ~/.bashrc
     Reloads shell environment configuration into active terminal session.
   - Shortcut: Ctrl + R
     Triggers global interactive fuzzy history search without auto-executing matches.
================================================================================
*/


/*
================================================================================
BOOKMYSHOW PROJECT - STEP 30: LOCALSTORAGE PERSISTENCE & LAZY STATE INITIALIZATION
================================================================================

1. LAZY INITIAL STATE VIA `useReducer`
   - Used the 3-argument overload of `useReducer`: `useReducer(reducer, null, getInitialState)`.
   - `getInitialState` extracts and parses stored favorites from `localStorage` 
     strictly ONCE during the initial component mount, guarding re-render performance.

2. STRING SERIALIZATION & PARSING
   - Handled browser storage format limits using `JSON.stringify()` on save 
     and `JSON.parse()` inside try-catch blocks to prevent runtime crashes.

3. EFFECT SYNCHRONIZATION (`useEffect`)
   - Configured a dedicated `useEffect` with `[state.favorites]` dependency array 
     to automatically synchronize local storage state whenever favorites are updated.

4. 100% FEATURE PARITY MAINTENANCE
   - Retained the `searchQuery` state property alongside `movies`, `favorites`, 
     and `loading` flags to ensure zero regression across search components.
================================================================================
*/

// Import necessary React hooks and functions from the "react" library
import React, { createContext, useContext, useReducer, useEffect } from "react";

// Import routing components from "react-router-dom" for multi-page navigation
import { BrowserRouter, Routes, Route, Link, Outlet, useParams } from "react-router-dom";

// ---------------------------------------------------------
// 1. TYPES & BLUEPRINTS (Compile-Time TypeScript Definitions)
// ---------------------------------------------------------

interface Movie {
  id: string;
  title: string;
  genre: string;
}

interface MovieState {
  movies: Movie[];
  favorites: string[];
  loading: boolean;
  searchQuery: string; // Preserved search query state
}

type MovieAction = 
  | { type: "SET_MOVIES"; payload: Movie[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "ADD_FAVORITE"; payload: string }
  | { type: "REMOVE_FAVORITE"; payload: string };

interface MovieContextType {
  state: MovieState;
  dispatch: React.Dispatch<MovieAction>;
}

const MovieContext = createContext<MovieContextType | undefined>(undefined);

// ---------------------------------------------------------
// 2. THE REDUCER FUNCTION (The Global Brain & Auditor)
// ---------------------------------------------------------

const MovieReducer = (state: MovieState, action: MovieAction): MovieState => {
  switch (action.type) {
    case "SET_MOVIES":
      return { ...state, movies: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };
    case "ADD_FAVORITE":
      if (state.favorites.includes(action.payload)) return state;
      return { ...state, favorites: [...state.favorites, action.payload] };
    case "REMOVE_FAVORITE":
      return { ...state, favorites: state.favorites.filter(id => id !== action.payload) };
    default:
      return state;
  }
};

// Helper function for Lazy Initial State (runs only once on mount)
const getInitialState = (): MovieState => {
  try {
    const savedFavorites = localStorage.getItem("bookmyshow_favorites");
    return {
      movies: [],
      favorites: savedFavorites ? JSON.parse(savedFavorites) : [],
      loading: true,
      searchQuery: "",
    };
  } catch (error) {
    console.error("Failed to load favorites from localStorage:", error);
    return { movies: [], favorites: [], loading: true, searchQuery: "" };
  }
};

// ---------------------------------------------------------
// 3. APP ROOT & LOCALSTORAGE SYNC ENGINE
// ---------------------------------------------------------

function App() {
  // Initialize global useReducer using lazy initial state initializer
  const [state, dispatch] = useReducer(MovieReducer, null, getInitialState);

  // Automatically sync state.favorites to browser storage on state changes
  useEffect(() => {
    try {
      localStorage.setItem("bookmyshow_favorites", JSON.stringify(state.favorites));
    } catch (error) {
      console.error("Failed to save favorites to localStorage:", error);
    }
  }, [state.favorites]);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const mockData: Movie[] = [
          { id: "1", title: "Leo", genre: "Action / Thriller" },
          { id: "2", title: "Master", genre: "Action / Drama" },
          { id: "3", title: "Vikram", genre: "Action / Crime" },
          { id: "4", title: "Interstellar", genre: "Sci-Fi / Adventure" }
        ];
        dispatch({ type: "SET_MOVIES", payload: mockData });
        dispatch({ type: "SET_LOADING", payload: false });
      } catch (error) {
        console.error("Failed to fetch movies", error);
        dispatch({ type: "SET_LOADING", payload: false });
      }
    };

    fetchMovies();
  }, []);

  return (
    <MovieContext.Provider value={{ state, dispatch }}>
      {/* App Component Structure Remains Consistent */}
    </MovieContext.Provider>
  );
}

export default App;


/*
================================================================================
BOOKMYSHOW PROJECT - STEP 31: ADVANCED CUSTOM HOOKS (`useLocalStorage`)
================================================================================

1. EXTRACTION & SEPARATION OF CONCERNS
   - Extracted browser `localStorage` error handling (`try/catch`), JSON parsing/serialization, 
     and state synchronization out of `App.tsx` into a reusable custom hook (`useLocalStorage`).
   - Keeps the main `App` component focused strictly on routing, context provisioning, and global state orchestration.

2. GENERIC TYPES IN TYPESCRIPT (`<T>`)
   - Utilized TypeScript generics (`<T>`) so the custom hook can accept and return any data type 
     (arrays, strings, objects) with full type-safe parameterization.

3. FUNCTIONAL UPDATES & STATE PARITY
   - Integrated `value instanceof Function` logic inside the custom setter (`setValue`) to 
     fully support functional state updates (`prev => next`) identical to React's native `useState` API.
================================================================================
*/

// Import necessary React hooks and functions from the "react" library
import React, { createContext, useContext, useReducer, useEffect, useState } from "react";

// Import routing components from "react-router-dom" for multi-page navigation
import { BrowserRouter, Routes, Route, Link, Outlet, useParams } from "react-router-dom";

// ---------------------------------------------------------
// 1. TYPES & BLUEPRINTS (Compile-Time TypeScript Definitions)
// ---------------------------------------------------------

interface Movie {
  id: string;
  title: string;
  genre: string;
}

interface MovieState {
  movies: Movie[];
  favorites: string[];
  loading: boolean;
  searchQuery: string;
}

type MovieAction = 
  | { type: "SET_MOVIES"; payload: Movie[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "ADD_FAVORITE"; payload: string }
  | { type: "REMOVE_FAVORITE"; payload: string };

interface MovieContextType {
  state: MovieState;
  dispatch: React.Dispatch<MovieAction>;
}

const MovieContext = createContext<MovieContextType | undefined>(undefined);

// ---------------------------------------------------------
// 2. THE REDUCER FUNCTION (The Global Brain & Auditor)
// ---------------------------------------------------------

const MovieReducer = (state: MovieState, action: MovieAction): MovieState => {
  switch (action.type) {
    case "SET_MOVIES":
      return { ...state, movies: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };
    case "ADD_FAVORITE":
      if (state.favorites.includes(action.payload)) return state;
      return { ...state, favorites: [...state.favorites, action.payload] };
    case "REMOVE_FAVORITE":
      return { ...state, favorites: state.favorites.filter(id => id !== action.payload) };
    default:
      return state;
  }
};

// ---------------------------------------------------------
// 3. REUSABLE CUSTOM HOOK: useLocalStorage
// ---------------------------------------------------------
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}

// ---------------------------------------------------------
// 4. APP ROOT & HOOK INTEGRATION
// ---------------------------------------------------------

function App() {
  // Call our custom hook to manage favorites persistence automatically
  const [savedFavorites, setSavedFavorites] = useLocalStorage<string[]>("bookmyshow_favorites", []);

  // Initial state function uses the value retrieved by our custom hook
  const getInitialState = (): MovieState => ({
    movies: [],
    favorites: savedFavorites,
    loading: true,
    searchQuery: "",
  });

  // Initialize global useReducer
  const [state, dispatch] = useReducer(MovieReducer, null, getInitialState);

  // Sync reducer state changes back to localStorage via the custom hook setter
  useEffect(() => {
    setSavedFavorites(state.favorites);
  }, [state.favorites, setSavedFavorites]);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const mockData: Movie[] = [
          { id: "1", title: "Leo", genre: "Action / Thriller" },
          { id: "2", title: "Master", genre: "Action / Drama" },
          { id: "3", title: "Vikram", genre: "Action / Crime" },
          { id: "4", title: "Interstellar", genre: "Sci-Fi / Adventure" }
        ];
        dispatch({ type: "SET_MOVIES", payload: mockData });
        dispatch({ type: "SET_LOADING", payload: false });
      } catch (error) {
        console.error("Failed to fetch movies", error);
        dispatch({ type: "SET_LOADING", payload: false });
      }
    };

    fetchMovies();
  }, []);

  return (
    <MovieContext.Provider value={{ state, dispatch }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<div>Home Layout Placeholder</div>} />
        </Routes>
      </BrowserRouter>
    </MovieContext.Provider>
  );
}

export default App;