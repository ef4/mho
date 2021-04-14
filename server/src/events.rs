// stark inspiration from https://github.com/arve0/actix-sse/
use actix_web::web::Bytes;
use actix_web::Error;
use hotwatch::{Event, Hotwatch};
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};
use tokio::stream::Stream;
use tokio::sync::mpsc::{self, error::TryRecvError, Receiver, Sender};
use tokio::sync::RwLock;
use tokio::time::Interval;

#[derive(Default, Clone)]
pub struct ChangeBroadcaster {
    clients: Arc<RwLock<Vec<Sender<Bytes>>>>,
}
impl ChangeBroadcaster {
    pub fn create(path: &str) -> Self {
        let me = Self::default();

        // ping clients every 10 seconds to see if they are alive
        ChangeBroadcaster::spawn_ping(me.clone());
        // setup filewatcher
        let mut watcher = Hotwatch::new().expect("hotwatch failed to initialize!");
        watcher
            .watch(path, move |event| {
                println!("event: {:?}", event);
                // if let Event::Write(_path) = event {
                //     changed.store(true, Ordering::Release);
                // }
            })
            .expect("Can start watching");

        me
    }
    pub async fn new_client(&self) -> Client {
        let (tx, rx) = mpsc::channel::<Bytes>(100);
        self.clients.write().await.push(tx);

        Client(rx)
    }
    pub async fn send(&self, msg: &str) {
        let msg = Bytes::from(["data: ", msg, "\n\n"].concat());

        for client in self.clients.read().await.iter() {
            client.clone().try_send(msg.clone()).unwrap_or(());
        }
    }
    fn spawn_ping(me: Self) {
        let mut interval = tokio::time::interval(Duration::from_secs(10));
        actix_web::rt::spawn(async move {
            loop {
                interval.tick().await;
                me.remove_stale_clients().await
            }
        });
    }
    async fn remove_stale_clients(&self) {
        let mut ok_clients = Vec::new();
        {
            //to drop read lock before trying to write clients
            for client in self.clients.read().await.iter() {
                let result = client.clone().try_send(Bytes::from("data: ping\n\n"));
                if let Ok(()) = result {
                    ok_clients.push(client.clone());
                }
            }
        }
        *self.clients.write().await = ok_clients
    }
}

// wrap Receiver in own type, with correct error type
pub struct Client(Receiver<Bytes>);

impl Stream for Client {
    type Item = Result<Bytes, Error>;

    fn poll_next(mut self: Pin<&mut Self>, _ctx: &mut Context) -> Poll<Option<Self::Item>> {
        match self.0.try_recv() {
            Ok(inner) => Poll::Ready(Some(Ok(inner))),
            Err(err) => match err {
                TryRecvError::Empty => Poll::Pending,
                TryRecvError::Closed => Poll::Ready(None),
            },
        }
    }
}
