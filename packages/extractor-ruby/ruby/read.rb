# The Ruby half of the Ruby extractor. It reads each file with Ripper and reports its class and
# module bodies, its methods and the call sites inside them. Which function a call ties to is a
# question the TypeScript half answers. Ripper ships with every Ruby, so the extractor needs no gem.
#
# Usage: ruby read.rb <repo> < repo-relative paths, one per line
# Writes {"ruby": RUBY_DESCRIPTION, "files": {"<path>": {"parsed": true, "bodies": [...],
# "methods": [...], "calls": [...]}}}, and {"parsed": false} for a file Ripper cannot parse.
# A body is one `class` or `module` keyword, with the superclass, the mixins and the macros it names.

require "digest"
require "json"
require "ripper"

class PositionedSexp < Ripper::SexpBuilderPP
  # A def reduces as soon as its last token is read, so the lexer position is its last line.
  def on_def(*args)
    super << lineno
  end

  def on_defs(*args)
    super << lineno
  end

  # A `super` node holds no token, so each one takes the position of its keyword. The keywords
  # stack, because `super(super())` reduces the inner one first.
  def on_kw(token)
    (@supers ||= []) << [lineno, column] if token == "super"
    super
  end

  def on_zsuper
    super << @supers.pop
  end

  def on_super(*args)
    super << @supers.pop
  end
end

class FileReader
  attr_reader :bodies, :methods, :calls

  def initialize(source, tree)
    @lines = source.lines
    @line_starts = @lines.each_with_object([0]) { |line, starts| starts << starts.last + line.bytesize }
    @source = source
    @bodies = []
    @methods = []
    @calls = []
    visit(tree, Context.new([], false, nil, nil))
  end

  Context = Struct.new(:nesting, :singleton, :method, :body)

  MIXINS = %w[include prepend extend].freeze
  MACROS = %w[attr attr_reader attr_writer attr_accessor delegate scope has_many has_one belongs_to
              has_and_belongs_to_many].freeze

  private

  def visit(node, context)
    return unless node.is_a?(Array)
    return node.each { |child| visit(child, context) } unless node.first.is_a?(Symbol)

    case node.first
    when :module
      visit_body(node[1], nil, node[2], context)
    when :class
      visit(node[2], context)
      visit_body(node[1], node[2], node[3], context)
    when :sclass
      visit(node[2], Context.new(context.nesting, true, nil, context.body))
    when :def
      visit_def(node[1], node[2], node[3], node.last, context.singleton, context)
    when :defs
      visit_def(node[3], node[4], node[5], node.last, true, context)
    when :fcall, :vcall
      record(context, nil, node[1])
      node.drop(2).each { |child| visit(child, context) }
    when :command
      declare(context, node[1], node[2])
      record(context, nil, node[1])
      visit(node[2], context)
    when :method_add_arg
      declare(context, node[1][1], node[2]) if node[1].first == :fcall
      node.drop(1).each { |child| visit(child, context) }
    when :call
      record(context, node[1], node[3])
      visit(node[1], context)
    when :method_add_block
      return visit_class_methods(node[2], context) if class_methods?(node[1], context)

      node.drop(1).each { |child| visit(child, context) }
    when :zsuper, :super
      record_super(context, node.last)
      visit(node[1], context) if node.first == :super
    when :command_call
      record(context, node[1], node[3])
      visit(node[1], context)
      node.drop(4).each { |child| visit(child, context) }
    else
      node.each { |child| visit(child, context) }
    end
  end

  def visit_body(name, superclass, body, context)
    nesting = nested(context.nesting, name)
    return visit(body, Context.new(nesting, false, nil, context.body)) if nesting.equal?(context.nesting)

    opened = open_body(nesting.first, superclass && reference_of(superclass, context.nesting))
    visit(body, Context.new(nesting, false, nil, opened))
  end

  def open_body(name, superclass)
    @bodies << { "name" => name.join("::"), "superclass" => superclass, "mixins" => [], "macros" => [] }
    @bodies.length - 1
  end

  # The `class_methods` block of a Rails concern defines the module `ClassMethods` inside it, which
  # the concern extends each class that includes it with.
  def class_methods?(call, context)
    call = call[1] if call.first == :method_add_arg
    context.method.nil? && context.body && %i[fcall vcall].include?(call.first) && call[1][1] == "class_methods"
  end

  def visit_class_methods(block, context)
    opened = context.nesting.first + ["ClassMethods"]
    visit(block, Context.new([opened] + context.nesting, false, nil, open_body(opened, nil)))
  end

  # A call in a class body, or in a block there such as `included do`, declares something of the
  # class: a module it mixes in, or the methods that a macro such as `has_many` makes.
  def declare(context, name, arguments)
    return unless context.method.nil? && context.body && token?(name)

    body = @bodies[context.body]
    if MIXINS.include?(name[1])
      kind = context.singleton && name[1] == "include" ? "extend" : name[1]
      arguments_of(arguments).each do |argument|
        body["mixins"] << { "kind" => kind }.merge(reference_of(argument, context.nesting))
      end
    elsif MACROS.include?(name[1])
      body["macros"] << macro_of(name[1], arguments_of(arguments), context.singleton)
    end
  end

  def macro_of(name, arguments, singleton)
    options = arguments.select { |argument| argument.first == :bare_assoc_hash }.flat_map(&:last)
    {
      "name" => name,
      "singleton" => singleton,
      "symbols" => arguments.filter_map { |argument| literal_of(argument) },
      "options" => options.each_with_object({}) do |(_, key, value), read|
        literal = value && literal_of(value)
        read[key[1].delete_suffix(":")] = literal unless key.first != :@label || literal.nil?
      end
    }
  end

  def literal_of(node)
    case node.first
    when :symbol_literal then node[1][1][1] if node[1].first == :symbol
    when :string_literal
      content = node[1]
      content[1][1] if content.length == 2 && content[1].first == :@tstring_content
    when :var_ref then true if node[1][0] == :@kw && node[1][1] == "true"
    end
  end

  def arguments_of(node)
    node = node[1] if node.is_a?(Array) && node.first == :arg_paren
    node.is_a?(Array) && node.first == :args_add_block ? node[1] : []
  end

  # A reference with no path names no constant, so it never resolves.
  def reference_of(node, nesting)
    return { "nesting" => [], "path" => nesting.first || [], "absolute" => true } if self?(node)

    path, absolute = constant_path(node)
    { "nesting" => nesting, "path" => path || [], "absolute" => absolute || false }
  end

  def visit_def(name, params, body, last_line, singleton, context)
    first_line = name[2][0]
    @methods << {
      "owner" => (context.nesting.first || []).join("::"),
      "singleton" => singleton,
      "name" => name[1],
      "firstLine" => first_line,
      "lastLine" => last_line,
      "sourceHash" => Digest::SHA256.hexdigest(@lines[(first_line - 1)...last_line].join)
    }
    inner = Context.new(context.nesting, singleton, @methods.length - 1, context.body)
    visit(params, inner)
    visit(body, inner)
  end

  def record(context, receiver, name)
    return if context.method.nil? || !token?(name)

    @calls << {
      "method" => context.method,
      "line" => name[2][0],
      "name" => name[1],
      "receiver" => receiver_of(receiver, context),
      "expression" => expression_of(receiver, name)
    }
  end

  def record_super(context, (line, _column))
    return if context.method.nil?

    @calls << {
      "method" => context.method,
      "line" => line,
      "name" => @methods[context.method]["name"],
      "receiver" => { "kind" => "super" },
      "expression" => "super"
    }
  end

  def token?(node)
    node.is_a?(Array) && node.first.is_a?(Symbol) && node.first.start_with?("@")
  end

  def receiver_of(receiver, context)
    return { "kind" => "self" } if receiver.nil? || self?(receiver)

    path, absolute = constant_path(receiver)
    return { "kind" => "value" } if path.nil?

    { "kind" => "constant", "nesting" => context.nesting, "path" => path, "absolute" => absolute }
  end

  def self?(node)
    node.first == :var_ref && node[1][0] == :@kw && node[1][1] == "self"
  end

  def constant_path(node)
    case node.first
    when :var_ref then node[1][0] == :@const ? [[node[1][1]], false] : nil
    when :top_const_ref then [[node[1][1]], true]
    when :const_path_ref
      path, absolute = constant_path(node[1])
      path && [path + [node[2][1]], absolute]
    end
  end

  # A token of a literal or of `::Foo` starts after the delimiter that opens the receiver.
  OPENING_DELIMITERS = {
    paren: ["("], array: ["["], hash: ["{"], string_literal: ['"', "'"], top_const_ref: ["::"]
  }.freeze

  def expression_of(receiver, name)
    finish = offset_of(name[2]) + name[1].bytesize
    start = receiver.nil? ? offset_of(name[2]) : first_offset_in(receiver) || offset_of(name[2])
    opening = (receiver && OPENING_DELIMITERS[receiver.first] || []).find do |delimiter|
      @source.byteslice(start - delimiter.bytesize, delimiter.bytesize) == delimiter
    end
    start -= opening.bytesize if opening
    @source.byteslice(start...finish).gsub(/\s*\n\s*/, "")
  end

  def first_offset_in(node)
    return unless node.is_a?(Array)
    return offset_of(node[2]) if token?(node)

    node.filter_map { |child| first_offset_in(child) }.min
  end

  def offset_of((line, column))
    @line_starts[line - 1] + column
  end

  def declared_path(name)
    case name.first
    when :const_ref then [[name[1][1]], false]
    when :top_const_ref then [[name[1][1]], true]
    when :const_path_ref then constant_path(name)
    end
  end

  # Ruby searches the name a class or module keyword opened, and not the namespaces its compact
  # name passed through, so `class Admin::RefundsController` adds one entry and not two.
  def nested(nesting, name)
    path, absolute = declared_path(name)
    return nesting if path.nil?

    opened = absolute ? path : (nesting.first || []) + path
    [opened] + nesting
  end
end

repo = ARGV.fetch(0) { abort("usage: ruby read.rb <repo> < paths") }
files = {}
$stdin.each_line(chomp: true) do |path|
  next if path.empty?

  source = File.binread(File.join(repo, path)).force_encoding(Encoding::UTF_8).scrub
  parser = PositionedSexp.new(source, path)
  tree = parser.parse
  if tree.nil? || parser.error?
    files[path] = { "parsed" => false }
    next
  end

  read = FileReader.new(source, tree)
  files[path] = { "parsed" => true, "bodies" => read.bodies, "methods" => read.methods, "calls" => read.calls }
end
$stdout.write(JSON.generate({ "ruby" => RUBY_DESCRIPTION, "files" => files }))
