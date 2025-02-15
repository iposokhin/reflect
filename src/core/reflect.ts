import { Effect, Event, EventCallable, is, scopeBind, Store } from 'effector';
import { useProvidedScope } from 'effector-react';
import React from 'react';

import { BindProps, Context, Hook, Hooks, UseUnitConifg, View } from './types';

export interface ReflectConfig<Props, Bind extends BindProps<Props>> {
  view: View<Props>;
  bind: Bind;
  hooks?: Hooks;
  useUnitConfig?: UseUnitConifg;
}

export function reflectCreateFactory(context: Context) {
  const reflect = reflectFactory(context);

  return function createReflect<Props>(view: View<Props>) {
    return <Bind extends BindProps<Props> = BindProps<Props>>(
      bind: Bind,
      params?: Pick<ReflectConfig<Props, Bind>, 'hooks' | 'useUnitConfig'>,
    ) => reflect<Props, Bind>({ view, bind, ...params });
  };
}

export function reflectFactory(context: Context) {
  return function reflect<Props, Bind extends BindProps<Props> = BindProps<Props>>(
    config: ReflectConfig<Props, Bind>,
  ): React.ExoticComponent<{}> {
    const { stores, events, data, functions } = sortProps(config);

    return React.forwardRef((props, ref) => {
      const storeProps = context.useUnit(stores, config.useUnitConfig);
      const eventsProps = context.useUnit(events as any, config.useUnitConfig);
      const functionProps = useBindedFunctions(functions);

      const elementProps: Props = Object.assign(
        { ref },
        storeProps,
        eventsProps,
        data,
        functionProps,
        props,
      );

      const mounted = wrapToHook(
        config.hooks?.mounted,
        context,
        config.useUnitConfig,
      );
      const unmounted = wrapToHook(
        config.hooks?.unmounted,
        context,
        config.useUnitConfig,
      );

      React.useEffect(() => {
        if (mounted) mounted();

        return () => {
          if (unmounted) unmounted();
        };
      }, []);

      return React.createElement(config.view as any, elementProps as any);
    });
  };
}

function sortProps<Props, Bind extends BindProps<Props> = BindProps<Props>>(
  config: ReflectConfig<Props, Bind>,
) {
  type GenericEvent = Event<unknown> | Effect<unknown, unknown, unknown>;

  const events: Record<string, GenericEvent> = {};
  const stores: Record<string, Store<unknown>> = {};
  const data: Record<string, unknown> = {};
  const functions: Record<string, Function> = {};

  for (const key in config.bind) {
    const value = config.bind[key];

    if (is.event(value) || is.effect(value)) {
      events[key] = value;
    } else if (is.store(value)) {
      stores[key] = value;
    } else if (typeof value === 'function') {
      functions[key] = value;
    } else {
      data[key] = value;
    }
  }

  return { events, stores, data, functions };
}

function useBindedFunctions(functions: Record<string, Function>) {
  const scope = useProvidedScope();

  return React.useMemo(() => {
    const bindedFunctions: Record<string, Function> = {};

    for (const key in functions) {
      const fn = functions[key];

      bindedFunctions[key] = scopeBind(fn, { scope: scope || undefined, safe: true });
    }

    return bindedFunctions;
  }, [scope, functions]);
}

function wrapToHook(hook: Hook | void, context: Context, config?: UseUnitConifg) {
  if (hookDefined(hook)) {
    return context.useUnit(hook as EventCallable<void>, config);
  }

  return hook;
}

function hookDefined(hook: Hook | void): hook is Hook {
  return Boolean(hook && (is.event(hook) || is.effect(hook)));
}
