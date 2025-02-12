use nargo::errors::CompileError;
use noirc_errors::FileDiagnostic;
use rayon::prelude::*;

use fm::FileManager;
use iter_extended::try_vecmap;
use nargo::insert_all_files_for_workspace_into_file_manager;
use nargo::package::Package;
use nargo::prepare_package;
use nargo::workspace::Workspace;
use nargo_toml::{get_package_manifest, resolve_workspace_from_toml, PackageSelection};
use noirc_driver::{
    compile_no_check, file_manager_with_stdlib, CompileOptions, CompiledProgram,
    NOIR_ARTIFACT_VERSION_STRING,
};

use noirc_frontend::graph::CrateName;

use clap::Args;

use crate::backends::Backend;
use crate::errors::CliError;

use super::check_cmd::check_crate_and_report_errors;

use super::compile_cmd::report_errors;
use super::fs::program::save_program_to_file;
use super::NargoConfig;

/// Exports functions marked with #[export] attribute
#[derive(Debug, Clone, Args)]
pub(crate) struct ExportCommand {
    /// The name of the package to compile
    #[clap(long, conflicts_with = "workspace")]
    package: Option<CrateName>,

    /// Compile all packages in the workspace
    #[clap(long, conflicts_with = "package")]
    workspace: bool,

    #[clap(flatten)]
    compile_options: CompileOptions,
}

pub(crate) fn run(
    _backend: &Backend,
    args: ExportCommand,
    config: NargoConfig,
) -> Result<(), CliError> {
    let toml_path = get_package_manifest(&config.program_dir)?;
    let default_selection =
        if args.workspace { PackageSelection::All } else { PackageSelection::DefaultOrAll };
    let selection = args.package.map_or(default_selection, PackageSelection::Selected);

    let workspace = resolve_workspace_from_toml(
        &toml_path,
        selection,
        Some(NOIR_ARTIFACT_VERSION_STRING.to_owned()),
    )?;

    let mut workspace_file_manager = file_manager_with_stdlib(&workspace.root_dir);
    insert_all_files_for_workspace_into_file_manager(&workspace, &mut workspace_file_manager);

    let library_packages: Vec<_> =
        workspace.into_iter().filter(|package| package.is_library()).collect();

    library_packages
        .par_iter()
        .map(|package| {
            compile_exported_functions(
                &workspace_file_manager,
                &workspace,
                package,
                &args.compile_options,
            )
        })
        .collect()
}

fn compile_exported_functions(
    file_manager: &FileManager,
    workspace: &Workspace,
    package: &Package,
    compile_options: &CompileOptions,
) -> Result<(), CliError> {
    let (mut context, crate_id) = prepare_package(file_manager, package);
    check_crate_and_report_errors(
        &mut context,
        crate_id,
        compile_options.deny_warnings,
        compile_options.disable_macros,
        compile_options.silence_warnings,
    )?;

    let exported_functions = context.get_all_exported_functions_in_crate(&crate_id);

    let exported_programs = try_vecmap(
        exported_functions,
        |(function_name, function_id)| -> Result<(String, CompiledProgram), CompileError> {
            // TODO: We should to refactor how to deal with compilation errors to avoid this.
            let program = compile_no_check(&context, compile_options, function_id, None, false)
                .map_err(|error| vec![FileDiagnostic::from(error)]);

            let program = report_errors(
                program.map(|program| (program, Vec::new())),
                file_manager,
                compile_options.deny_warnings,
                compile_options.silence_warnings,
            )?;

            Ok((function_name, program))
        },
    )?;

    let export_dir = workspace.export_directory_path();
    for (function_name, program) in exported_programs {
        save_program_to_file(&program.into(), &function_name.parse().unwrap(), &export_dir);
    }
    Ok(())
}
