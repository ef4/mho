use notify::{RecommendedWatcher, RecursiveMode, Result as NotifyResult, Watcher};
use rocket::tokio::io::AsyncRead;
use std::io::{self, Cursor, Read};
use std::path::PathBuf;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::sync::broadcast::{self, Receiver, Sender};

pub struct Watching {
    rx: Receiver<notify::Event>,
    tx: Sender<notify::Event>,
    watcher: RecommendedWatcher,
}

impl Watching {
    pub fn subscribe(&self) -> Receiver<notify::Event> {
        self.tx.subscribe()
    }
}

pub struct StreamingEvents {
    rx: Receiver<notify::Event>,
}

impl AsyncRead for StreamingEvents {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut [u8],
    ) -> Poll<Result<usize, io::Error>> {
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

pub fn watch_files(dir: PathBuf) -> NotifyResult<Watching> {
    let (tx, rx) = broadcast::channel(4);

    // Automatically select the best implementation for your platform.
    let mut watcher: RecommendedWatcher = Watcher::new_immediate(move |res| match res {
        Ok(event) => {
            tx.send(event).ok();
        }
        Err(e) => println!("watch error: {:?}", e),
    })?;

    // Add a path to be watched. All files and directories at that path and
    // below will be monitored for changes.
    watcher.watch(dir, RecursiveMode::Recursive)?;

    Ok(Watching { tx, rx, watcher })
}
