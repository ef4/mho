use rocket::response::{self, NamedFile, Responder, Response};
use rocket::Request;

#[derive(Debug, Clone, PartialEq)]
pub struct ETag<R>(pub String, pub R);

impl ETag<NamedFile> {
  pub async fn on(named: NamedFile) -> Option<ETag<NamedFile>> {
    let meta = named.file().metadata().await.ok()?;
    let modified = meta.modified().ok()?;
    let duration = modified
      .duration_since(std::time::SystemTime::UNIX_EPOCH)
      .ok()?;
    let etag = duration.as_secs().to_string();
    Some(ETag(etag, named))
  }
}

impl<'r, 'o: 'r, R: Responder<'r, 'o>> Responder<'r, 'o> for ETag<R> {
  fn respond_to(self, req: &'r Request<'_>) -> response::Result<'o> {
    Response::build()
      .merge(self.1.respond_to(req)?)
      .header(rocket::http::Header::new("Etag", format!("\"{}\"", self.0)))
      .ok()
  }
}
