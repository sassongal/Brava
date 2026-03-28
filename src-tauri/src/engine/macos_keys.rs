//! macOS-specific global keyboard monitoring using CoreGraphics event taps.
//! This replaces rdev on macOS, which crashes due to event-tap queue issues.

#[cfg(target_os = "macos")]
pub mod monitor {
    use std::sync::mpsc;

    /// Key event received from the macOS event tap
    #[derive(Debug, Clone)]
    pub enum KeyEvent {
        /// A character was typed
        Character(char),
        /// Backspace pressed
        Backspace,
        /// Space or Return pressed (word boundary)
        WordBoundary,
    }

    /// Start the macOS global key monitor.
    /// Returns a receiver that yields KeyEvent values.
    /// The monitor runs on a separate thread using a CFRunLoop.
    ///
    /// IMPORTANT: Requires Accessibility permission (AXIsProcessTrusted).
    /// Call check_accessibility_permission() before starting.
    pub fn start_key_monitor() -> Result<mpsc::Receiver<KeyEvent>, String> {
        use std::os::raw::c_void;

        // CoreGraphics/CoreFoundation types
        type CGEventRef = *mut c_void;
        type CGEventTapProxy = *mut c_void;
        type CFMachPortRef = *mut c_void;
        type CFRunLoopSourceRef = *mut c_void;
        type CFRunLoopRef = *mut c_void;
        type CGEventMask = u64;
        type CGEventType = u32;
        const K_CG_EVENT_KEY_DOWN: CGEventType = 10;
        const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
        const K_CG_SESSION_EVENT_TAP: u32 = 1;
        const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;

        extern "C" {
            fn CGEventTapCreate(
                tap: u32,
                place: u32,
                options: u32,
                events_of_interest: CGEventMask,
                callback: extern "C" fn(
                    CGEventTapProxy,
                    CGEventType,
                    CGEventRef,
                    *mut c_void,
                ) -> CGEventRef,
                user_info: *mut c_void,
            ) -> CFMachPortRef;
            fn CFMachPortCreateRunLoopSource(
                allocator: *const c_void,
                port: CFMachPortRef,
                order: i64,
            ) -> CFRunLoopSourceRef;
            fn CFRunLoopGetCurrent() -> CFRunLoopRef;
            fn CFRunLoopAddSource(
                rl: CFRunLoopRef,
                source: CFRunLoopSourceRef,
                mode: *const c_void,
            );
            fn CFRunLoopRun();
        }

        // kCFRunLoopCommonModes
        extern "C" {
            static kCFRunLoopCommonModes: *const c_void;
        }

        let (tx, rx) = mpsc::channel::<KeyEvent>();

        // Leak the sender into a raw pointer so the C callback can use it.
        // Store as usize so it is Send-safe for the spawned thread.
        let tx_addr: usize = Box::into_raw(Box::new(tx)) as usize;

        extern "C" fn event_callback(
            _proxy: CGEventTapProxy,
            event_type: CGEventType,
            event: CGEventRef,
            user_info: *mut c_void,
        ) -> CGEventRef {
            // Type aliases repeated here because extern fn can't capture outer items
            type CGEventRef = *mut std::os::raw::c_void;
            type CGEventField = u32;

            const K_CG_EVENT_KEY_DOWN: u32 = 10;
            const K_CG_KEYBOARD_EVENT_KEYCODE: CGEventField = 9;
            const KEYCODE_BACKSPACE: i64 = 51;
            const KEYCODE_RETURN: i64 = 36;
            const KEYCODE_SPACE: i64 = 49;

            extern "C" {
                fn CGEventGetIntegerValueField(event: CGEventRef, field: CGEventField) -> i64;
                fn CGEventKeyboardGetUnicodeString(
                    event: CGEventRef,
                    max_length: u32,
                    actual_length: *mut u32,
                    buffer: *mut u16,
                );
            }

            if event_type != K_CG_EVENT_KEY_DOWN {
                return event;
            }

            let tx =
                unsafe { &*(user_info as *const std::sync::mpsc::Sender<super::monitor::KeyEvent>) };

            // Get the keycode
            let keycode =
                unsafe { CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) };

            // Get the Unicode character
            let mut buffer: [u16; 4] = [0; 4];
            let mut actual_length: u32 = 0;
            unsafe {
                CGEventKeyboardGetUnicodeString(event, 4, &mut actual_length, buffer.as_mut_ptr());
            }

            let key_event = if keycode == KEYCODE_BACKSPACE {
                super::monitor::KeyEvent::Backspace
            } else if keycode == KEYCODE_RETURN || keycode == KEYCODE_SPACE {
                super::monitor::KeyEvent::WordBoundary
            } else if actual_length > 0 {
                // Decode UTF-16
                if let Some(ch) =
                    char::decode_utf16(buffer[..actual_length as usize].iter().copied())
                        .next()
                        .and_then(|r| r.ok())
                {
                    if ch.is_control() {
                        return event;
                    }
                    super::monitor::KeyEvent::Character(ch)
                } else {
                    return event;
                }
            } else {
                return event;
            };

            let _ = tx.send(key_event);
            event
        }

        std::thread::spawn(move || {
            let tx_raw = tx_addr as *mut mpsc::Sender<KeyEvent>;
            let event_mask: CGEventMask = 1 << K_CG_EVENT_KEY_DOWN;

            let tap = unsafe {
                CGEventTapCreate(
                    K_CG_SESSION_EVENT_TAP,
                    K_CG_HEAD_INSERT_EVENT_TAP,
                    K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                    event_mask,
                    event_callback,
                    tx_raw as *mut c_void,
                )
            };

            if tap.is_null() {
                log::error!(
                    "Failed to create CGEventTap. Accessibility permission may not be granted."
                );
                // Clean up the leaked sender
                unsafe {
                    drop(Box::from_raw(tx_raw));
                }
                return;
            }

            unsafe {
                let source = CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
                if source.is_null() {
                    log::error!("Failed to create run loop source");
                    drop(Box::from_raw(tx_raw));
                    return;
                }

                let run_loop = CFRunLoopGetCurrent();
                CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);

                log::info!("macOS global key monitor started successfully");
                CFRunLoopRun(); // This blocks forever

                // CFRunLoopRun returned — tap was disabled or stopped
                drop(Box::from_raw(tx_raw));
                log::info!("macOS key monitor stopped");
            }
        });

        Ok(rx)
    }
}
