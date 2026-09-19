"""Model-local Sage input packing; never modifies dependency module globals."""
import logging
import types

LOG = logging.getLogger(__name__)
KERNEL = '_sageattn_int8_fp8_nhd'


def apply_high_res_stability(model):
    replacements = {}
    for path, bound in model.object_patches.items():
        if not path.endswith('.attn.forward'):
            continue
        fn = getattr(bound, '__func__', None)
        if fn is None or KERNEL not in fn.__code__.co_names:
            continue
        if getattr(fn, '_muse_high_res_stability', False):
            continue
        kernel = fn.__globals__.get(KERNEL)
        if not callable(kernel):
            raise RuntimeError('High-Res Stability: incompatible SageAttention helper. Disable this toggle or use a supported KJNodes version.')

        def packed_kernel(qkv, dtype, _kernel=kernel):
            # Preserve the helper's consuming-list contract and release strided
            # views as they are replaced. Already-contiguous inputs are no-ops.
            for i in range(len(qkv)):
                qkv[i] = qkv[i].contiguous()
            return _kernel(qkv, dtype)

        private_globals = dict(fn.__globals__)
        private_globals[KERNEL] = packed_kernel
        local_fn = types.FunctionType(fn.__code__, private_globals, fn.__name__, fn.__defaults__, fn.__closure__)
        local_fn.__kwdefaults__ = fn.__kwdefaults__
        local_fn.__dict__.update(fn.__dict__)
        local_fn._muse_high_res_stability = True
        replacements[path] = types.MethodType(local_fn, bound.__self__)

    if not replacements:
        if any(getattr(getattr(p, '__func__', None), '_muse_high_res_stability', False) for p in model.object_patches.values()):
            return model
        raise RuntimeError('High-Res Stability could not find the supported MiniMax H3 SageAttention patch. Disable the toggle or check KJNodes compatibility.')
    patched = model.clone()
    for path, method in replacements.items():
        patched.add_object_patch(path, method)
    LOG.info('[Muse Unified Loader] High-Res Stability ON: model-local input packing on %d attention blocks; dependency globals unchanged.', len(replacements))
    return patched
