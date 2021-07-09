const axios = require("axios")
const SpotifyWebApi = require("spotify-web-api-node")
const { createClient } = require("@supabase/supabase-js")

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
})
spotifyApi.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVER_ROLE_SECRET
)

const getAlbumDetail = ({ artist, album, spotify_album_id }) => {
  return axios({
    method: "GET",
    url: "https://amp-api.music.apple.com/v1/catalog/us/search",
    params: {
      term: `${artist} ${album}`,
      types: "albums",
    },
    headers: {
      authorization:
        "Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IldlYlBsYXlLaWQifQ.eyJpc3MiOiJBTVBXZWJQbGF5IiwiaWF0IjoxNjI0NjQwODcyLCJleHAiOjE2NDAxOTI4NzJ9.yT3syIsyvTJDVG-3tFfZU0BDC-3uw-mGhHvBzhfNW1Qyyq2z5YHVVpbBfWTyVHHXznIM3efAAwvnD5L365exUw",
    },
  }).then(result => {
    const album = result.data.results.albums.data[0]
    return {
      apple_music_album_id: album.id,
      name: album.attributes.name,
      artist: album.attributes.artistName,
      genre: album.attributes.genreNames[0],
      release_date: album.attributes.releaseDate,
      artwork_url: album.attributes.artwork.url,
      spotify_album_id,
    }
  })
}

const getAlbumsDetail = albums => {
  console.log("fetching albums from Apple Music")
  const requests = []
  albums.map(album => requests.push(getAlbumDetail(album)))
  return Promise.all(requests)
}

module.exports = async (req, res) => {
  await spotifyApi
    .refreshAccessToken()
    .then(data => {
      spotifyApi.setAccessToken(data.body.access_token)
      return spotifyApi.getPlaylist(process.env.SPOTIFY_PLAYLIST_ID)
    })
    .then(data => {
      const tracks = data.body.tracks.items
      console.log(`Total album count: ${tracks.length}`)
      const albums = []
      tracks.map(({ track }) => {
        albums.push({
          artist: track.artists[0].name,
          album: track.album.name,
          spotify_album_id: track.album.id,
        })
      })
      return getAlbumsDetail(albums)
    })
    .then(async albums => {
      console.log("updating supabase")
      const { data: albumsInSupabase } = await supabase
        .from("albums")
        .select("*")
      const filteredAlbums = albums.filter(album => {
        if (
          albumsInSupabase.find(
            a => a.spotify_album_id === album.spotify_album_id
          ) === undefined
        )
          return album
      })
      const { data, error } = await supabase
        .from("albums")
        .insert(filteredAlbums)
      console.log(data)
      console.log({ error })
    })

  res.status(200).send(`OK`)
}
