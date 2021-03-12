//! An SSE Responder.
//!
//! This module might be suitable for inclusion in rocket_contrib.
use rocket::request::Request;
use rocket::response::{Responder, Response, Stream};
use rocket::tokio::io::AsyncRead;
use std::io::{self, Cursor, Read};
use std::pin::Pin;
use std::task::{Context, Poll};
// TODO: Comprehensive support for all possible message types and fields:
//   * comments
//   * custom fields (ignored by EventSource API, but worth considering)
/// A single SSE message, with optional `event`, `data`, and `id` fields.
#[derive(Clone)]
pub struct Message {
  event: Option<String>,
  id: Option<String>,
  data: Option<String>,
  retry: Option<u32>,
}
#[derive(Clone)]
pub struct MessageBuilder(Message);
impl Message {
  /// Creates a new Message with only the data field specified
  pub fn data<S: Into<String>>(data: S) -> Self {
    Self {
      event: None,
      id: None,
      data: Some(data.into()),
      retry: None,
    }
  }
  /// Creates an empty `MessageBuilder`
  pub fn build() -> MessageBuilder {
    MessageBuilder(Self {
      event: None,
      id: None,
      data: None,
      retry: None,
    })
  }
  /// Serializes this Message into a byte vector.
  pub fn serialize(self) -> Vec<u8> {
    let mut vec = vec![];
    if let Some(event) = self.event {
      vec.extend(b"event: ");
      vec.extend(event.into_bytes());
      vec.extend(b"\n");
    }
    if let Some(id) = self.id {
      vec.extend(b"id: ");
      vec.extend(id.into_bytes());
      vec.extend(b"\n");
    }
    if let Some(data) = self.data {
      for line in data.lines() {
        vec.extend(b"data: ");
        vec.extend(line.as_bytes());
        vec.extend(b"\n");
      }
    }
    vec.extend(b"\n");
    vec
  }
}
impl MessageBuilder {
  // TODO: Result instead of panic!
  /// Create a new Message with event, data, and id all (optionally) specified
  ///
  /// # Panics
  ///
  /// Panics if either `event` or `id` contain newlines
  pub fn event<T: Into<String>>(mut self, event: T) -> Self {
    let event = event.into();
    if event.find(|b| b == '\r' || b == '\n').is_some() {
      panic!("event cannot contain newlines");
    }
    self.0.event = Some(event);
    self
  }
  pub fn id<T: Into<String>>(mut self, id: T) -> Self {
    let id = id.into();
    if id.find(|b| b == '\r' || b == '\n').is_some() {
      panic!("id cannot contain newlines");
    }
    self.0.id = Some(id);
    self
  }
  pub fn data<T: Into<String>>(mut self, data: T) -> Self {
    let data = data.into();
    self.0.data = Some(data);
    self
  }
  pub fn retry(mut self, retry: u32) -> Self {
    self.0.retry = Some(retry);
    self
  }
}
impl From<MessageBuilder> for Message {
  fn from(builder: MessageBuilder) -> Self {
    builder.0
  }
}

/// An SSE stream. This type implements `Responder`; see the
/// [`from_stream`] function for a usage example.
pub struct EventSource<S> {
  stream: S,
  state: State,
}

enum State {
  Reading(Cursor<Vec<u8>>),
  Done,
}
impl<S: Stream<Item = Message>> EventSource<S> {
  /// Creates an `EventSource` from a [`Stream`] of [`Message`]s.
  ///
  /// # Example
  ///
  /// ```rust
  /// # use rocket::get;
  /// #
  /// use rocket_rooms::sse::{self, Message, EventSource};
  /// use rocket::tokio::stream::{self, Stream};
  ///
  /// #[get("/stream")]
  /// fn stream() -> EventSource<impl Stream<Item = Message>> {
  ///     let mut i = 0;
  ///     EventSource::from_stream(stream::iter(std::iter::from_fn(move || {
  ///         i += 1;
  ///         if i <= 3 {
  ///             Some(Message::data(format!("data{}", i)))
  ///         } else {
  ///             None
  ///         }
  ///     })))
  /// }
  /// ```
  pub fn from_stream(stream: S) -> EventSource<S> {
    EventSource {
      stream,
      state: State::Reading(Cursor::new(vec![])),
    }
  }
}
impl<'r, 'o: 'r, S: Stream<Item = Message> + Send + 'o> Responder<'r, 'o> for EventSource<S> {
  fn respond_to(self, _req: &'r Request<'_>) -> rocket::response::Result<'o> {
    Response::build()
      .raw_header("Content-Type", "text/event-stream")
      .raw_header("Cache-Control", "no-cache")
      .raw_header("Expires", "0")
      .streamed_body(self)
      .ok()
  }
}
impl<S: Stream<Item = Message>> AsyncRead for EventSource<S> {
  fn poll_read(
    self: Pin<&mut Self>,
    cx: &mut Context<'_>,
    buf: &mut [u8],
  ) -> Poll<Result<usize, io::Error>> {
    let mut this = self.project();
    if buf.is_empty() {
      return Poll::Ready(Ok(0));
    }
    loop {
      match this.state {
        State::Reading(cursor) => {
          if cursor.position() as usize >= cursor.get_ref().len() {
            // buffer is empty; get the next one
            match this.stream.as_mut().poll_next(cx) {
              Poll::Pending => return Poll::Pending,
              Poll::Ready(Some(next_event)) => {
                *this.state = State::Reading(Cursor::new(next_event.serialize()))
              }
              Poll::Ready(None) => *this.state = State::Done,
            }
          } else {
            // Copy as much pending data as possible
            return Poll::Ready(Ok(cursor.read(buf)?));
          }
        }
        State::Done => return Poll::Ready(Ok(0)),
      }
    }
  }
}
