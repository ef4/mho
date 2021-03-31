use rocket::local::blocking::Client;
use rocket::http::{Status, ContentType};
use crate::rocket;

#[test]
fn bad_get_put() {
    let client = Client::tracked(rocket()).unwrap();

    // Try to get a message with an ID that doesn't exist.
    let res = client.get("/message/99").header(ContentType::JSON).dispatch();
    assert_eq!(res.status(), Status::NotFound);

    let body = res.into_string().unwrap();
    assert!(body.contains("error"));
    assert!(body.contains("Resource was not found."));

    // Try to get a message with an invalid ID.
    let res = client.get("/message/hi").header(ContentType::JSON).dispatch();
    assert_eq!(res.status(), Status::NotFound);
    let body = res.into_string().unwrap();
    assert!(body.contains("error"));

    // Try to put a message without a proper body.
    let res = client.put("/message/80").header(ContentType::JSON).dispatch();
    assert_eq!(res.status(), Status::BadRequest);

    // Try to put a message for an ID that doesn't exist.
    let res = client.put("/message/80")
        .header(ContentType::JSON)
        .body(r#"{ "contents": "Bye bye, world!" }"#)
        .dispatch();

    assert_eq!(res.status(), Status::NotFound);
}

#[test]
fn post_get_put_get() {
    let client = Client::tracked(rocket()).unwrap();

    // Check that a message with ID 1 doesn't exist.
    let res = client.get("/message/1").header(ContentType::JSON).dispatch();
    assert_eq!(res.status(), Status::NotFound);

    // Add a new message with ID 1.
    let res = client.post("/message/1")
        .header(ContentType::JSON)
        .body(r#"{ "contents": "Hello, world!" }"#)
        .dispatch();

    assert_eq!(res.status(), Status::Ok);

    // Check that the message exists with the correct contents.
    let res = client.get("/message/1").header(ContentType::JSON).dispatch();
    assert_eq!(res.status(), Status::Ok);
    let body = res.into_string().unwrap();
    assert!(body.contains("Hello, world!"));

    // Change the message contents.
    let res = client.put("/message/1")
        .header(ContentType::JSON)
        .body(r#"{ "contents": "Bye bye, world!" }"#)
        .dispatch();

    assert_eq!(res.status(), Status::Ok);

    // Check that the message exists with the updated contents.
    let res = client.get("/message/1").header(ContentType::JSON).dispatch();
    assert_eq!(res.status(), Status::Ok);
    let body = res.into_string().unwrap();
    assert!(!body.contains("Hello, world!"));
    assert!(body.contains("Bye bye, world!"));
}
