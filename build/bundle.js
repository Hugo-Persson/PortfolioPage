
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.24.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src\PortfolioLink.svelte generated by Svelte v3.24.0 */

    const file = "src\\PortfolioLink.svelte";

    function create_fragment(ctx) {
    	let a;
    	let t_value = /*link*/ ctx[0].name + "";
    	let t;
    	let a_href_value;

    	const block = {
    		c: function create() {
    			a = element("a");
    			t = text(t_value);
    			attr_dev(a, "class", "button svelte-13hwwca");
    			attr_dev(a, "href", a_href_value = /*link*/ ctx[0].url);
    			add_location(a, file, 16, 0, 198);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, t);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*link*/ 1 && t_value !== (t_value = /*link*/ ctx[0].name + "")) set_data_dev(t, t_value);

    			if (dirty & /*link*/ 1 && a_href_value !== (a_href_value = /*link*/ ctx[0].url)) {
    				attr_dev(a, "href", a_href_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { link } = $$props;
    	const writable_props = ["link"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<PortfolioLink> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("PortfolioLink", $$slots, []);

    	$$self.$set = $$props => {
    		if ("link" in $$props) $$invalidate(0, link = $$props.link);
    	};

    	$$self.$capture_state = () => ({ link });

    	$$self.$inject_state = $$props => {
    		if ("link" in $$props) $$invalidate(0, link = $$props.link);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [link];
    }

    class PortfolioLink extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { link: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "PortfolioLink",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*link*/ ctx[0] === undefined && !("link" in props)) {
    			console.warn("<PortfolioLink> was created without expected prop 'link'");
    		}
    	}

    	get link() {
    		throw new Error("<PortfolioLink>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set link(value) {
    		throw new Error("<PortfolioLink>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\PortfolioSkill.svelte generated by Svelte v3.24.0 */

    const file$1 = "src\\PortfolioSkill.svelte";

    // (23:2) {:else}
    function create_else_block(ctx) {
    	let i;
    	let i_class_value;

    	const block = {
    		c: function create() {
    			i = element("i");
    			attr_dev(i, "class", i_class_value = /*skill*/ ctx[0].icon);
    			add_location(i, file$1, 23, 4, 381);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, i, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*skill*/ 1 && i_class_value !== (i_class_value = /*skill*/ ctx[0].icon)) {
    				attr_dev(i, "class", i_class_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(i);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(23:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (21:2) {#if skill.icon.substr(0, 7) !== 'devicon'}
    function create_if_block(ctx) {
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*skill*/ ctx[0].icon)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "");
    			attr_dev(img, "class", "svelte-nnf1j6");
    			add_location(img, file$1, 21, 4, 333);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*skill*/ 1 && img.src !== (img_src_value = /*skill*/ ctx[0].icon)) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(21:2) {#if skill.icon.substr(0, 7) !== 'devicon'}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div;
    	let show_if;
    	let t0;
    	let span;
    	let t1_value = /*skill*/ ctx[0].name + "";
    	let t1;

    	function select_block_type(ctx, dirty) {
    		if (show_if == null || dirty & /*skill*/ 1) show_if = !!(/*skill*/ ctx[0].icon.substr(0, 7) !== "devicon");
    		if (show_if) return create_if_block;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx, -1);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			t0 = space();
    			span = element("span");
    			t1 = text(t1_value);
    			add_location(span, file$1, 25, 2, 418);
    			attr_dev(div, "class", "svelte-nnf1j6");
    			add_location(div, file$1, 19, 0, 275);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_block.m(div, null);
    			append_dev(div, t0);
    			append_dev(div, span);
    			append_dev(span, t1);
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx, dirty)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, t0);
    				}
    			}

    			if (dirty & /*skill*/ 1 && t1_value !== (t1_value = /*skill*/ ctx[0].name + "")) set_data_dev(t1, t1_value);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { skill } = $$props;
    	const writable_props = ["skill"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<PortfolioSkill> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("PortfolioSkill", $$slots, []);

    	$$self.$set = $$props => {
    		if ("skill" in $$props) $$invalidate(0, skill = $$props.skill);
    	};

    	$$self.$capture_state = () => ({ skill });

    	$$self.$inject_state = $$props => {
    		if ("skill" in $$props) $$invalidate(0, skill = $$props.skill);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [skill];
    }

    class PortfolioSkill extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { skill: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "PortfolioSkill",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*skill*/ ctx[0] === undefined && !("skill" in props)) {
    			console.warn("<PortfolioSkill> was created without expected prop 'skill'");
    		}
    	}

    	get skill() {
    		throw new Error("<PortfolioSkill>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set skill(value) {
    		throw new Error("<PortfolioSkill>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\PortfolioItem.svelte generated by Svelte v3.24.0 */
    const file$2 = "src\\PortfolioItem.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[1] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (39:6) {#each item.links as link}
    function create_each_block_1(ctx) {
    	let portfoliolink;
    	let current;

    	portfoliolink = new PortfolioLink({
    			props: { link: /*link*/ ctx[4] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(portfoliolink.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(portfoliolink, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const portfoliolink_changes = {};
    			if (dirty & /*item*/ 1) portfoliolink_changes.link = /*link*/ ctx[4];
    			portfoliolink.$set(portfoliolink_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(portfoliolink.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(portfoliolink.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(portfoliolink, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(39:6) {#each item.links as link}",
    		ctx
    	});

    	return block;
    }

    // (52:6) {#each item.skills as skill}
    function create_each_block(ctx) {
    	let portfolioskill;
    	let current;

    	portfolioskill = new PortfolioSkill({
    			props: { skill: /*skill*/ ctx[1] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(portfolioskill.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(portfolioskill, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const portfolioskill_changes = {};
    			if (dirty & /*item*/ 1) portfolioskill_changes.skill = /*skill*/ ctx[1];
    			portfolioskill.$set(portfolioskill_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(portfolioskill.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(portfolioskill.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(portfolioskill, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(52:6) {#each item.skills as skill}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div5;
    	let div4;
    	let div0;
    	let t0;
    	let div1;
    	let h2;
    	let t1_value = /*item*/ ctx[0].name + "";
    	let t1;
    	let t2;
    	let div2;
    	let raw_value = /*item*/ ctx[0].description + "";
    	let t3;
    	let div3;
    	let current;
    	let each_value_1 = /*item*/ ctx[0].links;
    	validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const out = i => transition_out(each_blocks_1[i], 1, 1, () => {
    		each_blocks_1[i] = null;
    	});

    	let each_value = /*item*/ ctx[0].skills;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out_1 = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div4 = element("div");
    			div0 = element("div");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t0 = space();
    			div1 = element("div");
    			h2 = element("h2");
    			t1 = text(t1_value);
    			t2 = space();
    			div2 = element("div");
    			t3 = space();
    			div3 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div0, "class", "links  svelte-1qmnsei");
    			add_location(div0, file$2, 37, 4, 713);
    			add_location(h2, file$2, 44, 6, 862);
    			attr_dev(div1, "class", "name svelte-1qmnsei");
    			add_location(div1, file$2, 43, 4, 836);
    			attr_dev(div2, "class", "description");
    			add_location(div2, file$2, 46, 4, 900);
    			attr_dev(div3, "class", "skills svelte-1qmnsei");
    			add_location(div3, file$2, 49, 4, 975);
    			attr_dev(div4, "class", "portfolioItemContainer svelte-1qmnsei");
    			add_location(div4, file$2, 36, 2, 671);
    			attr_dev(div5, "class", "wrap svelte-1qmnsei");
    			add_location(div5, file$2, 35, 0, 649);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, div0);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div0, null);
    			}

    			append_dev(div4, t0);
    			append_dev(div4, div1);
    			append_dev(div1, h2);
    			append_dev(h2, t1);
    			append_dev(div4, t2);
    			append_dev(div4, div2);
    			div2.innerHTML = raw_value;
    			append_dev(div4, t3);
    			append_dev(div4, div3);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div3, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*item*/ 1) {
    				each_value_1 = /*item*/ ctx[0].links;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    						transition_in(each_blocks_1[i], 1);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						transition_in(each_blocks_1[i], 1);
    						each_blocks_1[i].m(div0, null);
    					}
    				}

    				group_outros();

    				for (i = each_value_1.length; i < each_blocks_1.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if ((!current || dirty & /*item*/ 1) && t1_value !== (t1_value = /*item*/ ctx[0].name + "")) set_data_dev(t1, t1_value);
    			if ((!current || dirty & /*item*/ 1) && raw_value !== (raw_value = /*item*/ ctx[0].description + "")) div2.innerHTML = raw_value;
    			if (dirty & /*item*/ 1) {
    				each_value = /*item*/ ctx[0].skills;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div3, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out_1(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks_1[i]);
    			}

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks_1 = each_blocks_1.filter(Boolean);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				transition_out(each_blocks_1[i]);
    			}

    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { item } = $$props;
    	const writable_props = ["item"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<PortfolioItem> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("PortfolioItem", $$slots, []);

    	$$self.$set = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    	};

    	$$self.$capture_state = () => ({ item, PortfolioLink, PortfolioSkill });

    	$$self.$inject_state = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [item];
    }

    class PortfolioItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { item: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "PortfolioItem",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*item*/ ctx[0] === undefined && !("item" in props)) {
    			console.warn("<PortfolioItem> was created without expected prop 'item'");
    		}
    	}

    	get item() {
    		throw new Error("<PortfolioItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set item(value) {
    		throw new Error("<PortfolioItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Portfolio.svelte generated by Svelte v3.24.0 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[1] = list[i];
    	return child_ctx;
    }

    // (151:0) {#each portfolioData as item}
    function create_each_block$1(ctx) {
    	let portfolioitem;
    	let current;

    	portfolioitem = new PortfolioItem({
    			props: { item: /*item*/ ctx[1] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(portfolioitem.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(portfolioitem, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(portfolioitem.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(portfolioitem.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(portfolioitem, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(151:0) {#each portfolioData as item}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*portfolioData*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*portfolioData*/ 1) {
    				each_value = /*portfolioData*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	const portfolioData = [
    		{
    			links: [
    				{
    					url: "https://github.com/Hugo-Persson/T4OrderSystemBackend",
    					name: "Source code"
    				},
    				{
    					url: "https://school-order.herokuapp.com/",
    					name: "Live Demo"
    				}
    			],
    			name: "Industri beställning applikation",
    			description: `<p>Denna webbapplikationen skapades på uppdrag av en kund, industripogrammet på kattegattgymnasiet, jag jobbade då på
      detta projektet mot dem under mitt tredje år på kattegattgymnasiet.
      Applikationen hanterar beställningar som kunder skickar till industriprogrammet. Admins kan sortera alla
      beställningar och hantera dem,
      varje beställning har en status och kontaktuppgifter som kunden kan se och admins kan uppdatera</p <p>

      Backend är byggt med NodeJS med Express och frontend är byggt med hjälp av Svelte och Bootstrap. För inloggning använder
      jag mig av passwordless istället för
      det normala systemet med ett användarnamn + lösenord. Passwordless bygger på att inga konton har lösenord, istället så
      skickas en verifikations kod till användarna
      när de loggar in. Jag valde passwordless då det skapar större säkerhet för kunden. Jag använde mig av MongoDB för att
      spara alla användare och beställningar.

      </p>
      <p>
          För att se sidan kan ni klicka på live demo, för att komma åt kundportalen är det bara att skriva in en e-mail och
          skapa ett konto, om ni vill se adminsidan
          kan ni använda e-mailen "adminSiteDemo@example.com", detta kontot har behöver inte verifieras med en kod för demo
          verisionen av sidan.
      </p>`,
    			skills: [
    				{
    					name: "JavaScript",
    					icon: "devicon-javascript-plain colored"
    				},
    				{ name: "Svelte", icon: "/svelte.png" },
    				{
    					name: "Bootstrap",
    					icon: "devicon-bootstrap-plain colored"
    				},
    				{
    					name: "NodeJS",
    					icon: "devicon-nodejs-plain colored"
    				},
    				{
    					name: "Express",
    					icon: "devicon-express-original colored"
    				},
    				{
    					name: "MongoDB",
    					icon: "devicon-mongodb-plain colored"
    				}
    			]
    		},
    		{
    			links: [
    				{
    					url: "https://github.com/Hugo-Persson/CrunchyrollPlusXamarin",
    					name: "Source code"
    				},
    				{
    					url: "https://drive.google.com/file/d/1XqmtVD6bfMzROGm3Jfsyvl9DcgNA6dmr/view?usp=sharing",
    					name: "Ladda ner APK"
    				}
    			],
    			name: "Xamarin forms video streaming app",
    			description: `<p>
        Detta projektet är en mobil app jag skapade i Xamarin Forms, appen är en streaming app som förmedlar video från
        Crunchyroll.com API.
        Jag skapade appen då jag kände att den crunchyroll appen som finns kan förbättras på flera sätt. För att testa appen
        kan ni ladda ner och installera APK filen
        eller clona git repositoryt och bygga projektet. Appen fungerar både på Android och IOS men det är inte publicerad
        på App Store eller Play Store så för att testa
        appen för IOS måste ni bygga projektet till er IOS enhet.




        </p>`,
    			skills: [
    				{
    					name: "C#",
    					icon: "devicon-csharp-plain colored"
    				},
    				{
    					name: "Xamarin Forms",
    					icon: "xamarin_logo.png"
    				}
    			]
    		},
    		{
    			links: [
    				{
    					url: "https://github.com/Hugo-Persson/OnePaceStreamer",
    					name: "Source code"
    				},
    				{
    					url: "https://one-pace-stream.herokuapp.com/",
    					name: "Live Demo"
    				}
    			],
    			name: "Torrent streaming applikation",
    			description: `
        <p>
            Denna webbapplikationen är gjord för att kunna streama en torrent på ett enkelt sätt. Applikation gör så att
            användaren inte behöver installera någon torrent programvara
            så som BitTorrent istället så gör servern det och streamar videon direkt till användaren. Detta gör en stor skillnad
            på mobila enheter där det kan vara komplicerat
            att använda torrent program.
        </p>
        <p>
            Programmet använder WebTorrent och NodeJS för att göra om torrenten till en stream som sedan en media spelar så som
            VLC kan stream direkt. Du skulle även
            kunna streama median direkt i webbläsaren men filformatet är .mkv vilket webbläsarna inte stödjer.

        </p>`,
    			skills: [
    				{
    					name: "JavaScript",
    					icon: "devicon-javascript-plain colored"
    				},
    				{ name: "Svelte", icon: "/svelte.png" },
    				{
    					name: "NodeJS",
    					icon: "devicon-nodejs-plain colored"
    				},
    				{
    					name: "Express",
    					icon: "devicon-express-original colored"
    				}
    			]
    		}
    	];

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Portfolio> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Portfolio", $$slots, []);
    	$$self.$capture_state = () => ({ PortfolioItem, portfolioData });
    	return [portfolioData];
    }

    class Portfolio extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Portfolio",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* src\Experience.svelte generated by Svelte v3.24.0 */

    const file$3 = "src\\Experience.svelte";

    function create_fragment$4(ctx) {
    	let div3;
    	let div2;
    	let h1;
    	let t1;
    	let div0;
    	let h20;
    	let t3;
    	let div1;
    	let h21;
    	let t5;
    	let ul;
    	let li0;
    	let t7;
    	let li1;
    	let t9;
    	let li2;
    	let t11;
    	let li3;
    	let t13;
    	let li4;
    	let t15;
    	let li5;
    	let t17;
    	let li6;
    	let t19;
    	let li7;

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div2 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Erfaranheter";
    			t1 = space();
    			div0 = element("div");
    			h20 = element("h2");
    			h20.textContent = "Final i programmeringsolympiaden";
    			t3 = space();
    			div1 = element("div");
    			h21 = element("h2");
    			h21.textContent = "Kunskaper inom följande tekniker";
    			t5 = space();
    			ul = element("ul");
    			li0 = element("li");
    			li0.textContent = "Svelte";
    			t7 = space();
    			li1 = element("li");
    			li1.textContent = "JavaScript";
    			t9 = space();
    			li2 = element("li");
    			li2.textContent = "React";
    			t11 = space();
    			li3 = element("li");
    			li3.textContent = "C# - .NET miljön";
    			t13 = space();
    			li4 = element("li");
    			li4.textContent = "MongoDB";
    			t15 = space();
    			li5 = element("li");
    			li5.textContent = "MySQL";
    			t17 = space();
    			li6 = element("li");
    			li6.textContent = "PHP";
    			t19 = space();
    			li7 = element("li");
    			li7.textContent = "Python";
    			attr_dev(h1, "class", "svelte-ephsx5");
    			add_location(h1, file$3, 28, 4, 440);
    			add_location(h20, file$3, 30, 6, 494);
    			attr_dev(div0, "class", "sheet svelte-ephsx5");
    			add_location(div0, file$3, 29, 4, 467);
    			add_location(h21, file$3, 34, 6, 582);
    			add_location(li0, file$3, 36, 8, 645);
    			add_location(li1, file$3, 37, 8, 670);
    			add_location(li2, file$3, 38, 8, 699);
    			add_location(li3, file$3, 39, 8, 723);
    			add_location(li4, file$3, 40, 8, 758);
    			add_location(li5, file$3, 41, 8, 784);
    			add_location(li6, file$3, 42, 8, 808);
    			add_location(li7, file$3, 43, 8, 830);
    			add_location(ul, file$3, 35, 6, 631);
    			attr_dev(div1, "class", "sheet svelte-ephsx5");
    			add_location(div1, file$3, 33, 4, 555);
    			attr_dev(div2, "id", "wrap");
    			attr_dev(div2, "class", "svelte-ephsx5");
    			add_location(div2, file$3, 27, 2, 419);
    			attr_dev(div3, "id", "experienceBackround");
    			attr_dev(div3, "class", "svelte-ephsx5");
    			add_location(div3, file$3, 26, 0, 385);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div2);
    			append_dev(div2, h1);
    			append_dev(div2, t1);
    			append_dev(div2, div0);
    			append_dev(div0, h20);
    			append_dev(div2, t3);
    			append_dev(div2, div1);
    			append_dev(div1, h21);
    			append_dev(div1, t5);
    			append_dev(div1, ul);
    			append_dev(ul, li0);
    			append_dev(ul, t7);
    			append_dev(ul, li1);
    			append_dev(ul, t9);
    			append_dev(ul, li2);
    			append_dev(ul, t11);
    			append_dev(ul, li3);
    			append_dev(ul, t13);
    			append_dev(ul, li4);
    			append_dev(ul, t15);
    			append_dev(ul, li5);
    			append_dev(ul, t17);
    			append_dev(ul, li6);
    			append_dev(ul, t19);
    			append_dev(ul, li7);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props) {
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Experience> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Experience", $$slots, []);
    	return [];
    }

    class Experience extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Experience",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    function cubicInOut(t) {
        return t < 0.5 ? 4.0 * t * t * t : 0.5 * Math.pow(2.0 * t - 2.0, 3.0) + 1.0;
    }
    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }
    function quadOut(t) {
        return -t * (t - 2.0);
    }

    var _ = {
      $(selector) {
        if (typeof selector === "string") {
          return document.querySelector(selector);
        }
        return selector;
      },
      extend(...args) {
        return Object.assign(...args);
      },
      cumulativeOffset(element) {
        let top = 0;
        let left = 0;

        do {
          top += element.offsetTop || 0;
          left += element.offsetLeft || 0;
          element = element.offsetParent;
        } while (element);

        return {
          top: top,
          left: left
        };
      },
      directScroll(element) {
        return element && element !== document && element !== document.body;
      },
      scrollTop(element, value) {
        let inSetter = value !== undefined;
        if (this.directScroll(element)) {
          return inSetter ? (element.scrollTop = value) : element.scrollTop;
        } else {
          return inSetter
            ? (document.documentElement.scrollTop = document.body.scrollTop = value)
            : window.pageYOffset ||
                document.documentElement.scrollTop ||
                document.body.scrollTop ||
                0;
        }
      },
      scrollLeft(element, value) {
        let inSetter = value !== undefined;
        if (this.directScroll(element)) {
          return inSetter ? (element.scrollLeft = value) : element.scrollLeft;
        } else {
          return inSetter
            ? (document.documentElement.scrollLeft = document.body.scrollLeft = value)
            : window.pageXOffset ||
                document.documentElement.scrollLeft ||
                document.body.scrollLeft ||
                0;
        }
      }
    };

    const defaultOptions = {
      container: "body",
      duration: 500,
      delay: 0,
      offset: 0,
      easing: cubicInOut,
      onStart: noop,
      onDone: noop,
      onAborting: noop,
      scrollX: false,
      scrollY: true
    };

    const _scrollTo = options => {
      let {
        offset,
        duration,
        delay,
        easing,
        x=0,
        y=0,
        scrollX,
        scrollY,
        onStart,
        onDone,
        container,
        onAborting,
        element
      } = options;

      if (typeof offset === "function") {
        offset = offset();
      }

      var cumulativeOffsetContainer = _.cumulativeOffset(container);
      var cumulativeOffsetTarget = element
        ? _.cumulativeOffset(element)
        : { top: y, left: x };

      var initialX = _.scrollLeft(container);
      var initialY = _.scrollTop(container);

      var targetX =
        cumulativeOffsetTarget.left - cumulativeOffsetContainer.left + offset;
      var targetY =
        cumulativeOffsetTarget.top - cumulativeOffsetContainer.top + offset;

      var diffX = targetX - initialX;
    	var diffY = targetY - initialY;

      let scrolling = true;
      let started = false;
      let start_time = now() + delay;
      let end_time = start_time + duration;

      function scrollToTopLeft(element, top, left) {
        if (scrollX) _.scrollLeft(element, left);
        if (scrollY) _.scrollTop(element, top);
      }

      function start(delayStart) {
        if (!delayStart) {
          started = true;
          onStart(element, {x, y});
        }
      }

      function tick(progress) {
        scrollToTopLeft(
          container,
          initialY + diffY * progress,
          initialX + diffX * progress
        );
      }

      function stop() {
        scrolling = false;
      }

      loop(now => {
        if (!started && now >= start_time) {
          start(false);
        }

        if (started && now >= end_time) {
          tick(1);
          stop();
          onDone(element, {x, y});
        }

        if (!scrolling) {
          onAborting(element, {x, y});
          return false;
        }
        if (started) {
          const p = now - start_time;
          const t = 0 + 1 * easing(p / duration);
          tick(t);
        }

        return true;
      });

      start(delay);

      tick(0);

      return stop;
    };

    const proceedOptions = options => {
    	let opts = _.extend({}, defaultOptions, options);
      opts.container = _.$(opts.container);
      opts.element = _.$(opts.element);
      return opts;
    };

    const scrollContainerHeight = containerElement => {
      if (
        containerElement &&
        containerElement !== document &&
        containerElement !== document.body
      ) {
        return containerElement.scrollHeight - containerElement.offsetHeight;
      } else {
        let body = document.body;
        let html = document.documentElement;

        return Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.clientHeight,
          html.scrollHeight,
          html.offsetHeight
        );
      }
    };

    const setGlobalOptions = options => {
    	_.extend(defaultOptions, options || {});
    };

    const scrollTo = options => {
      return _scrollTo(proceedOptions(options));
    };

    const scrollToBottom = options => {
      options = proceedOptions(options);

      return _scrollTo(
        _.extend(options, {
          element: null,
          y: scrollContainerHeight(options.container)
        })
      );
    };

    const scrollToTop = options => {
      options = proceedOptions(options);

      return _scrollTo(
        _.extend(options, {
          element: null,
          y: 0
        })
      );
    };

    const makeScrollToAction = scrollToFunc => {
      return (node, options) => {
        let current = options;
        const handle = e => {
          e.preventDefault();
          scrollToFunc(
            typeof current === "string" ? { element: current } : current
          );
        };
        node.addEventListener("click", handle);
        node.addEventListener("touchstart", handle);
        return {
          update(options) {
            current = options;
          },
          destroy() {
            node.removeEventListener("click", handle);
            node.removeEventListener("touchstart", handle);
          }
        };
      };
    };

    const scrollto = makeScrollToAction(scrollTo);
    const scrolltotop = makeScrollToAction(scrollToTop);
    const scrolltobottom = makeScrollToAction(scrollToBottom);

    var animateScroll = /*#__PURE__*/Object.freeze({
        __proto__: null,
        setGlobalOptions: setGlobalOptions,
        scrollTo: scrollTo,
        scrollToBottom: scrollToBottom,
        scrollToTop: scrollToTop,
        makeScrollToAction: makeScrollToAction,
        scrollto: scrollto,
        scrolltotop: scrolltotop,
        scrolltobottom: scrolltobottom
    });

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function slide(node, { delay = 0, duration = 400, easing = cubicOut }) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => `overflow: hidden;` +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }

    /* src\Spinner.svelte generated by Svelte v3.24.0 */

    const file$4 = "src\\Spinner.svelte";

    function create_fragment$5(ctx) {
    	let div4;
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let div2;
    	let t2;
    	let div3;

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			t1 = space();
    			div2 = element("div");
    			t2 = space();
    			div3 = element("div");
    			attr_dev(div0, "class", "svelte-1umncu8");
    			add_location(div0, file$4, 39, 2, 827);
    			attr_dev(div1, "class", "svelte-1umncu8");
    			add_location(div1, file$4, 40, 2, 838);
    			attr_dev(div2, "class", "svelte-1umncu8");
    			add_location(div2, file$4, 41, 2, 849);
    			attr_dev(div3, "class", "svelte-1umncu8");
    			add_location(div3, file$4, 42, 2, 860);
    			attr_dev(div4, "class", "lds-ring svelte-1umncu8");
    			add_location(div4, file$4, 38, 0, 801);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div0);
    			append_dev(div4, t0);
    			append_dev(div4, div1);
    			append_dev(div4, t1);
    			append_dev(div4, div2);
    			append_dev(div4, t2);
    			append_dev(div4, div3);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props) {
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Spinner> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Spinner", $$slots, []);
    	return [];
    }

    class Spinner extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Spinner",
    			options,
    			id: create_fragment$5.name
    		});
    	}
    }

    /* src\ContactForm.svelte generated by Svelte v3.24.0 */

    const { console: console_1 } = globals;
    const file$5 = "src\\ContactForm.svelte";

    // (165:0) {:else}
    function create_else_block$1(ctx) {
    	let div1;
    	let div0;
    	let h2;
    	let t1;
    	let button;
    	let div1_transition;
    	let current;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Något gick fel";
    			t1 = space();
    			button = element("button");
    			button.textContent = "Skapa nytt meddelande";
    			attr_dev(h2, "class", "svelte-f8yi2p");
    			add_location(h2, file$5, 167, 6, 3568);
    			attr_dev(button, "class", "svelte-f8yi2p");
    			add_location(button, file$5, 168, 6, 3599);
    			attr_dev(div0, "class", "sheet svelte-f8yi2p");
    			add_location(div0, file$5, 166, 4, 3541);
    			attr_dev(div1, "id", "failWindow");
    			attr_dev(div1, "class", "formResponse svelte-f8yi2p");
    			add_location(div1, file$5, 165, 2, 3477);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, h2);
    			append_dev(div0, t1);
    			append_dev(div0, button);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, {}, true);
    				div1_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, {}, false);
    			div1_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (detaching && div1_transition) div1_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(165:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (157:22) 
    function create_if_block_2(ctx) {
    	let div1;
    	let div0;
    	let h2;
    	let t1;
    	let button;
    	let div1_transition;
    	let current;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Tack för ditt meddelande";
    			t1 = space();
    			button = element("button");
    			button.textContent = "Skicka ett nytt meddelande";
    			attr_dev(h2, "class", "svelte-f8yi2p");
    			add_location(h2, file$5, 159, 6, 3326);
    			attr_dev(button, "class", "svelte-f8yi2p");
    			add_location(button, file$5, 160, 6, 3367);
    			attr_dev(div0, "class", "sheet svelte-f8yi2p");
    			add_location(div0, file$5, 158, 4, 3299);
    			attr_dev(div1, "id", "successWindow");
    			attr_dev(div1, "class", "formResponse svelte-f8yi2p");
    			add_location(div1, file$5, 157, 2, 3232);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, h2);
    			append_dev(div0, t1);
    			append_dev(div0, button);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[5], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, {}, true);
    				div1_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fade, {}, false);
    			div1_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (detaching && div1_transition) div1_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(157:22) ",
    		ctx
    	});

    	return block;
    }

    // (118:0) {#if window === 0}
    function create_if_block$1(ctx) {
    	let div7;
    	let form_1;
    	let h2;
    	let t1;
    	let div1;
    	let div0;
    	let label0;
    	let t3;
    	let input0;
    	let t4;
    	let div3;
    	let div2;
    	let label1;
    	let t6;
    	let input1;
    	let t7;
    	let div5;
    	let div4;
    	let label2;
    	let t9;
    	let textarea;
    	let t10;
    	let div6;
    	let button;
    	let t12;
    	let div7_transition;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*loading*/ ctx[2] && create_if_block_1(ctx);

    	const block = {
    		c: function create() {
    			div7 = element("div");
    			form_1 = element("form");
    			h2 = element("h2");
    			h2.textContent = "Kontakta mig";
    			t1 = space();
    			div1 = element("div");
    			div0 = element("div");
    			label0 = element("label");
    			label0.textContent = "Namn:";
    			t3 = space();
    			input0 = element("input");
    			t4 = space();
    			div3 = element("div");
    			div2 = element("div");
    			label1 = element("label");
    			label1.textContent = "Email:";
    			t6 = space();
    			input1 = element("input");
    			t7 = space();
    			div5 = element("div");
    			div4 = element("div");
    			label2 = element("label");
    			label2.textContent = "Meddelande";
    			t9 = space();
    			textarea = element("textarea");
    			t10 = space();
    			div6 = element("div");
    			button = element("button");
    			button.textContent = "Skicka";
    			t12 = space();
    			if (if_block) if_block.c();
    			attr_dev(h2, "class", "svelte-f8yi2p");
    			add_location(h2, file$5, 121, 6, 2351);
    			attr_dev(label0, "for", "name");
    			attr_dev(label0, "class", "svelte-f8yi2p");
    			add_location(label0, file$5, 124, 10, 2435);
    			attr_dev(div0, "class", "innerContainer svelte-f8yi2p");
    			add_location(div0, file$5, 123, 8, 2395);
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "name", "name");
    			attr_dev(input0, "id", "name");
    			attr_dev(input0, "placeholder", "Namn");
    			attr_dev(input0, "class", "svelte-f8yi2p");
    			add_location(input0, file$5, 127, 8, 2494);
    			attr_dev(div1, "class", "svelte-f8yi2p");
    			add_location(div1, file$5, 122, 6, 2380);
    			attr_dev(label1, "for", "email");
    			attr_dev(label1, "class", "svelte-f8yi2p");
    			add_location(label1, file$5, 131, 10, 2633);
    			attr_dev(div2, "class", "innerContainer svelte-f8yi2p");
    			add_location(div2, file$5, 130, 8, 2593);
    			attr_dev(input1, "type", "email");
    			attr_dev(input1, "name", "email");
    			attr_dev(input1, "id", "email");
    			attr_dev(input1, "placeholder", "Email");
    			attr_dev(input1, "class", "svelte-f8yi2p");
    			add_location(input1, file$5, 134, 8, 2694);
    			attr_dev(div3, "class", "svelte-f8yi2p");
    			add_location(div3, file$5, 129, 6, 2578);
    			attr_dev(label2, "for", "message");
    			attr_dev(label2, "class", "svelte-f8yi2p");
    			add_location(label2, file$5, 138, 10, 2854);
    			attr_dev(div4, "class", "innerContainer svelte-f8yi2p");
    			add_location(div4, file$5, 137, 8, 2814);
    			attr_dev(textarea, "name", "message");
    			attr_dev(textarea, "id", "message");
    			attr_dev(textarea, "class", "svelte-f8yi2p");
    			add_location(textarea, file$5, 141, 8, 2921);
    			attr_dev(div5, "id", "messageWrap");
    			attr_dev(div5, "class", "svelte-f8yi2p");
    			add_location(div5, file$5, 136, 6, 2782);
    			attr_dev(button, "type", "submit");
    			attr_dev(button, "class", "svelte-f8yi2p");
    			add_location(button, file$5, 145, 8, 3000);
    			attr_dev(div6, "class", "svelte-f8yi2p");
    			add_location(div6, file$5, 144, 6, 2985);
    			attr_dev(form_1, "action", "");
    			attr_dev(form_1, "class", "sheet svelte-f8yi2p");
    			add_location(form_1, file$5, 120, 4, 2275);
    			attr_dev(div7, "id", "formWrapper");
    			attr_dev(div7, "class", "svelte-f8yi2p");
    			add_location(div7, file$5, 118, 2, 2229);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div7, anchor);
    			append_dev(div7, form_1);
    			append_dev(form_1, h2);
    			append_dev(form_1, t1);
    			append_dev(form_1, div1);
    			append_dev(div1, div0);
    			append_dev(div0, label0);
    			append_dev(div1, t3);
    			append_dev(div1, input0);
    			append_dev(form_1, t4);
    			append_dev(form_1, div3);
    			append_dev(div3, div2);
    			append_dev(div2, label1);
    			append_dev(div3, t6);
    			append_dev(div3, input1);
    			append_dev(form_1, t7);
    			append_dev(form_1, div5);
    			append_dev(div5, div4);
    			append_dev(div4, label2);
    			append_dev(div5, t9);
    			append_dev(div5, textarea);
    			append_dev(form_1, t10);
    			append_dev(form_1, div6);
    			append_dev(div6, button);
    			append_dev(form_1, t12);
    			if (if_block) if_block.m(form_1, null);
    			/*form_1_binding*/ ctx[4](form_1);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(form_1, "submit", /*sendForm*/ ctx[3], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (/*loading*/ ctx[2]) {
    				if (if_block) {
    					if (dirty & /*loading*/ 4) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(form_1, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);

    			add_render_callback(() => {
    				if (!div7_transition) div7_transition = create_bidirectional_transition(div7, fade, {}, true);
    				div7_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			if (!div7_transition) div7_transition = create_bidirectional_transition(div7, fade, {}, false);
    			div7_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div7);
    			if (if_block) if_block.d();
    			/*form_1_binding*/ ctx[4](null);
    			if (detaching && div7_transition) div7_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(118:0) {#if window === 0}",
    		ctx
    	});

    	return block;
    }

    // (148:6) {#if loading}
    function create_if_block_1(ctx) {
    	let div;
    	let spinner;
    	let current;
    	spinner = new Spinner({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(spinner.$$.fragment);
    			attr_dev(div, "id", "spinnerWrapper");
    			attr_dev(div, "transistion:slide", "");
    			attr_dev(div, "class", "svelte-f8yi2p");
    			add_location(div, file$5, 148, 8, 3082);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(spinner, div, null);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(spinner.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(spinner.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(spinner);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(148:6) {#if loading}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$1, create_if_block_2, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*window*/ ctx[1] === 0) return 0;
    		if (/*window*/ ctx[1] == 1) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let form;

    	async function sendForm(e) {
    		e.preventDefault();
    		console.log(new URLSearchParams(new FormData(form)).toString());

    		try {
    			const init = { method: "GET" };
    			$$invalidate(2, loading = true);
    			await fetch("https://script.google.com/macros/s/AKfycbwCH_cUwycqejVUST-FoMibz3LrGqukONR56csPTkKlS7tk4r8Y/exec?" + new URLSearchParams(new FormData(form)).toString());
    			$$invalidate(2, loading = false);
    			$$invalidate(1, window = 1);
    		} catch(err) {
    			$$invalidate(2, loading = false);
    			console.log(err);
    			$$invalidate(1, window = 2);
    		}
    	}

    	let window = 0;
    	let loading = false;
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<ContactForm> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("ContactForm", $$slots, []);

    	function form_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			form = $$value;
    			$$invalidate(0, form);
    		});
    	}

    	const click_handler = () => $$invalidate(1, window = 0);

    	$$self.$capture_state = () => ({
    		fade,
    		slide,
    		Spinner,
    		form,
    		sendForm,
    		window,
    		loading
    	});

    	$$self.$inject_state = $$props => {
    		if ("form" in $$props) $$invalidate(0, form = $$props.form);
    		if ("window" in $$props) $$invalidate(1, window = $$props.window);
    		if ("loading" in $$props) $$invalidate(2, loading = $$props.loading);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [form, window, loading, sendForm, form_1_binding, click_handler];
    }

    class ContactForm extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ContactForm",
    			options,
    			id: create_fragment$6.name
    		});
    	}
    }

    /* src\App.svelte generated by Svelte v3.24.0 */

    const { console: console_1$1 } = globals;
    const file$6 = "src\\App.svelte";

    function create_fragment$7(ctx) {
    	let header;
    	let h1;
    	let t1;
    	let span0;
    	let t3;
    	let div;
    	let span1;
    	let t5;
    	let br;
    	let t6;
    	let i;
    	let t7;
    	let main;
    	let portfolio;
    	let t8;
    	let experience;
    	let t9;
    	let contactform;
    	let current;
    	let mounted;
    	let dispose;
    	portfolio = new Portfolio({ $$inline: true });
    	experience = new Experience({ $$inline: true });
    	contactform = new ContactForm({ $$inline: true });

    	const block = {
    		c: function create() {
    			header = element("header");
    			h1 = element("h1");
    			h1.textContent = "Portfolio";
    			t1 = space();
    			span0 = element("span");
    			span0.textContent = "Hej, mitt namn är Hugo Persson och jag har haft programmering som en hobby i\n    flera år, jag har tidigare jobbat mot kund och skapat flera hobby projekt.\n    Nedan visar jag några av mina senaste projekt.";
    			t3 = space();
    			div = element("div");
    			span1 = element("span");
    			span1.textContent = "Scroll down";
    			t5 = space();
    			br = element("br");
    			t6 = space();
    			i = element("i");
    			t7 = space();
    			main = element("main");
    			create_component(portfolio.$$.fragment);
    			t8 = space();
    			create_component(experience.$$.fragment);
    			t9 = space();
    			create_component(contactform.$$.fragment);
    			attr_dev(h1, "class", "svelte-10nem3j");
    			add_location(h1, file$6, 94, 2, 1743);
    			attr_dev(span0, "class", "svelte-10nem3j");
    			add_location(span0, file$6, 95, 2, 1764);
    			attr_dev(span1, "class", "svelte-10nem3j");
    			add_location(span1, file$6, 101, 4, 2051);
    			add_location(br, file$6, 102, 4, 2080);
    			attr_dev(i, "class", "fad fa-chevron-double-down scrollDown svelte-10nem3j");
    			add_location(i, file$6, 103, 4, 2091);
    			attr_dev(div, "id", "scrollDownContainer");
    			attr_dev(div, "class", "svelte-10nem3j");
    			add_location(div, file$6, 100, 2, 1994);
    			attr_dev(header, "class", "svelte-10nem3j");
    			add_location(header, file$6, 93, 0, 1732);
    			attr_dev(main, "id", "main");
    			attr_dev(main, "class", "svelte-10nem3j");
    			add_location(main, file$6, 114, 0, 2387);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, header, anchor);
    			append_dev(header, h1);
    			append_dev(header, t1);
    			append_dev(header, span0);
    			append_dev(header, t3);
    			append_dev(header, div);
    			append_dev(div, span1);
    			append_dev(div, t5);
    			append_dev(div, br);
    			append_dev(div, t6);
    			append_dev(div, i);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, main, anchor);
    			mount_component(portfolio, main, null);
    			insert_dev(target, t8, anchor);
    			mount_component(experience, target, anchor);
    			insert_dev(target, t9, anchor);
    			mount_component(contactform, target, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*scrollDown*/ ctx[0], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(portfolio.$$.fragment, local);
    			transition_in(experience.$$.fragment, local);
    			transition_in(contactform.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(portfolio.$$.fragment, local);
    			transition_out(experience.$$.fragment, local);
    			transition_out(contactform.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(header);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(main);
    			destroy_component(portfolio);
    			if (detaching) detach_dev(t8);
    			destroy_component(experience, detaching);
    			if (detaching) detach_dev(t9);
    			destroy_component(contactform, detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { name } = $$props;
    	let showPortfolio = true;
    	setGlobalOptions({ easing: quadOut });

    	function scrollDown() {
    		//alert(window.orientation);
    		console.log("Scroll");

    		scrollTo({ element: "main", duration: 300 });
    	}

    	const writable_props = ["name"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1$1.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("App", $$slots, []);

    	$$self.$set = $$props => {
    		if ("name" in $$props) $$invalidate(1, name = $$props.name);
    	};

    	$$self.$capture_state = () => ({
    		name,
    		Portfolio,
    		Experience,
    		animateScroll,
    		quadOut,
    		ContactForm,
    		showPortfolio,
    		scrollDown
    	});

    	$$self.$inject_state = $$props => {
    		if ("name" in $$props) $$invalidate(1, name = $$props.name);
    		if ("showPortfolio" in $$props) showPortfolio = $$props.showPortfolio;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [scrollDown, name];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { name: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$7.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*name*/ ctx[1] === undefined && !("name" in props)) {
    			console_1$1.warn("<App> was created without expected prop 'name'");
    		}
    	}

    	get name() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
