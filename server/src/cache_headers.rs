use rocket::http::Header;
use rocket::response::{self, NamedFile, Responder, Response};
use rocket::Request;

#[derive(Debug, Clone, PartialEq)]
pub struct CacheHeaders<R>(Vec<(String, String)>, R);

impl CacheHeaders<NamedFile> {
  pub async fn etag(named: NamedFile) -> Option<CacheHeaders<NamedFile>> {
    let meta = named.file().metadata().await.ok()?;
    let modified = meta.modified().ok()?;
    let duration = modified
      .duration_since(std::time::SystemTime::UNIX_EPOCH)
      .ok()?;
    let etag = duration.as_secs().to_string();
    Some(CacheHeaders(
      vec![("Etag".to_string(), format!("\"{}\"", etag))],
      named,
    ))
  }
  pub fn immutable(named: NamedFile) -> CacheHeaders<NamedFile> {
    CacheHeaders(
      vec![(
        "Cache-Control".to_string(),
        "public, max-age=604800".to_string(),
      )],
      named,
    )
  }
}

impl<'r, 'o: 'r, R: Responder<'r, 'o>> Responder<'r, 'o> for CacheHeaders<R> {
  fn respond_to(self, req: &'r Request<'_>) -> response::Result<'o> {
    let mut r = Response::build();
    r.merge(self.1.respond_to(req)?);
    for (name, value) in self.0 {
      r.header(Header::new(name, value));
    }
    r.ok()
  }
}
