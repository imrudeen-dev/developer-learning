type MovieCardProps = {
    title: string;
    rating: number;
    genre: string;
}

function MovieCard ({ title, rating, genre} : MovieCardProps){
    return (
        <div>
            <h3>Title: {title}</h3>
            <p>Rating: {rating}</p>
            <p>Genre: {genre}</p>
        </div>
    );
}

export default MovieCard;